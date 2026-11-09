/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const html = readFileSync(`${__dirname}/agent-history-viewer.html`, 'utf8');
const context = vm.createContext({});
vm.runInContext(html.match(/<script id="trace-core">([\s\S]*?)<\/script>/)[1] + '\nglobalThis.core = AgentTraceViewer;', context);
const core = context.core;
const prefix = '==================Agent轨迹=================';
let ordinal = 0;
const record = (type, payload={}, fields={}) => ({schemaVersion:core.TRACE,recordId:`r${++ordinal}`,type,payload,projectId:'p',threadId:'t',turnId:'turn',runId:'run',recordedAt:'2026-10-08T02:00:00Z',...fields});
const plain = value => JSON.parse(JSON.stringify(value));

test('imports mixed logs, escaped braces and prefix text without cutting valid JSON',()=>{
  const first=record('model.request',{callId:'c',messages:[{role:'user',content:[{type:'text',text:`{ \\" ${prefix} }`}]}]});
  const second=record('segment.ended');
  const result=core.parse(`DEBUG unrelated\nDEBUG ${prefix}${JSON.stringify(first)}\n${prefix}${JSON.stringify(second)}\n`);
  assert.equal(result.records.length,2);assert.equal(result.warnings.length,0);assert.deepEqual(plain(result.records[0]),first);
});

test('actual artifact records show storage before validation even when no repair is needed',()=>{
  const path='agent-repairs/valid.txt',content='{\n  "components": []\n}',fields={requestId:'create',path,tool:'create_canvas_components',operationId:'op',workspaceRevision:1};
  const records=[record('tool.requested',{requestId:'create',name:'create_canvas_components',arguments:{components:[]}}),
    record('artifact.received',{requestId:'create',tool:'create_canvas_components',content:{components:[]}}),
    record('artifact.stored',{...fields,content}),record('artifact.read',{...fields,content}),
    record('artifact.validation.started',{...fields,stage:'syntax'}),record('artifact.validation.passed',{...fields,stage:'syntax'}),
    record('artifact.validation.started',{...fields,stage:'content'}),record('artifact.validation.passed',{...fields,stage:'content'}),
    record('artifact.frontend.requested',fields),record('artifact.frontend.submitted',{...fields,status:'pending',result:{operationId:'op'}}),
    record('tool.completed',{requestId:'create',name:'create_canvas_components',status:'pending',requiresFrontendEffect:true,result:{path,repairTool:'repair_artifact',operationId:'op'}}),
    record('frontend.effect.completed',{operationId:'op',toolCallId:'create',status:'applied',result:{confirmed:true}})];
  const repairs=core.repairRows(records);
  assert.equal(repairs.length,1);assert.equal(repairs[0].repair.explicit,true);
  assert.deepEqual(plain(repairs[0].repair.phases.map(p=>p.stage)),['generate','store','read','validate-start','validate','validate-start','validate','dispatch','continue','frontend-result']);
  assert.equal(repairs[0].repair.finalContent,content);assert.equal(repairs[0].repair.attempts,0);
  assert.equal(repairs[0].status,'已完成');
  const visible=core.processTimeline(records).filter(row=>row.kind==='repair');
  assert.deepEqual(plain(visible.map(row=>row.stage)),['write','final']);
  assert.equal(visible[0].content,content);assert.equal(visible[1].status,'JSON 有效');
  assert.ok(repairs[0].repair.phases.every(phase=>phase.debug.evidence==='实际处理日志'));
});

test('actual syntax and semantic failures are distinguished and patches display real file snapshots',()=>{
  const path='agent-repairs/chain.txt',content='{"width":-1',fixedSyntax='{"width":-1}',fixed='{"width":1}';
  const f={requestId:'create',path,tool:'create_canvas_components',operationId:'op',workspaceRevision:1};
  const p1={...f,requestId:'p1',workspaceRevision:2},p2={...f,requestId:'p2',workspaceRevision:3};
  const records=[record('artifact.stored',{...f,content}),record('artifact.read',{...f,content}),
    record('artifact.validation.failed',{...f,stage:'syntax',error:{code:'artifact_json_invalid',error:'missing brace'}}),
    record('artifact.repair.required',{...f,stage:'syntax',error:{code:'artifact_json_invalid'}}),
    record('artifact.patch.received',{...p1,expectedRevision:1,edits:[{oldText:'-1',newText:'-1}'}]}),
    record('artifact.patch.applied',{...p1,previousRevision:1,beforeContent:content,afterContent:fixedSyntax}),
    record('artifact.read',{...p1,content:fixedSyntax}),
    record('artifact.validation.passed',{...p1,stage:'syntax'}),
    record('artifact.validation.failed',{...p1,stage:'content',error:{code:'invalid_component',message:'width must be positive'}}),
    record('artifact.repair.required',{...p1,stage:'content',error:{code:'invalid_component'}}),
    record('artifact.patch.received',{...p2,expectedRevision:2,edits:[{oldText:'-1',newText:'1'}]}),
    record('artifact.patch.applied',{...p2,previousRevision:2,beforeContent:fixedSyntax,afterContent:fixed}),
    record('artifact.read',{...p2,content:fixed}),record('artifact.validation.passed',{...p2,stage:'syntax'}),
    record('artifact.validation.passed',{...p2,stage:'content'}),record('artifact.frontend.submitted',{...p2,status:'pending'})];
  const repair=core.repairRows(records)[0].repair;
  assert.equal(repair.attempts,2);assert.equal(repair.finalContent,fixed);
  const failures=repair.phases.filter(p=>p.stage==='validation-failed');
  assert.ok(failures[0].title.includes('JSON 语法'));assert.ok(failures[1].title.includes('组件配置'));
  const applied=repair.phases.filter(p=>p.stage==='apply');
  assert.equal(applied[0].before,content);assert.equal(applied[0].after,fixedSyntax);assert.equal(applied[1].after,fixed);
  const visible=core.processTimeline(records).filter(row=>row.kind==='repair');
  assert.deepEqual(plain(visible.map(row=>row.stage)),['write','feedback','patch','feedback','patch','final']);
  assert.equal(visible.at(-1).status,'JSON 已修复');
});

test('artifact.repair.required feedback prefers the full error actually returned to Agent',()=>{
  const path='agent-repairs/feedback.json',content='{"components":',fields={requestId:'create',path,tool:'create_canvas_components',operationId:'op',workspaceRevision:1};
  const returned={code:'artifact_json_invalid',path,workspaceRevision:1,error:'expected closing brace',charOffset:14,errorContext:content,contextStartOffset:0};
  const records=[record('tool.requested',{requestId:'create',name:'create_canvas_components',arguments:{components:content}}),
    record('artifact.stored',{...fields,content}),record('artifact.validation.failed',{...fields,stage:'syntax',error:{code:'artifact_json_invalid'}}),
    record('artifact.repair.required',{...fields,stage:'syntax',error:{code:'artifact_json_invalid'}}),
    record('tool.completed',{requestId:'create',name:'create_canvas_components',status:'repair_required',result:returned})];
  const feedback=core.processTimeline(records).find(row=>row.kind==='repair' && row.stage==='feedback');
  assert.deepEqual(plain(feedback.error),returned);
});

test('valid JSON can still carry a component validation error',()=>{
  const path='agent-repairs/semantic.json',content='{"components":[{"type":"missing"}]}';
  const f={requestId:'create',path,tool:'create_canvas_components',operationId:'op',workspaceRevision:1};
  const records=[record('artifact.stored',{...f,content}),record('artifact.read',{...f,content}),
    record('artifact.validation.passed',{...f,stage:'syntax'}),
    record('artifact.validation.failed',{...f,stage:'content',error:{code:'invalid_component',message:'未知组件类型'}}),
    record('artifact.repair.required',{...f,stage:'content',error:{code:'invalid_component',message:'未知组件类型'}})];
  const rows=core.processTimeline(records).filter(row=>row.kind==='repair');
  assert.equal(rows.find(row=>row.stage==='feedback').error.code,'invalid_component');
  assert.equal(rows.find(row=>row.stage==='final').status,'JSON 有效');
});

test('legacy content validation errors do not become JSON syntax failures',()=>{
  const content='{"components":[{"type":"missing"}]}',path='agent-repairs/legacy-semantic.json';
  const semantic={code:'invalid_component',validationStage:'content',repairTool:'repair_artifact',path,workspaceRevision:1,artifactUpdated:true,error:'unknown component type'};
  const fixed={...semantic,workspaceRevision:2};
  const records=[...toolTrace('create','create_canvas_components',{components:content},'repair_required',semantic),
    ...toolTrace('patch','repair_artifact',{path,expectedRevision:1,edits:[{oldText:'missing',newText:'chart'}]},'repair_required',fixed)];
  const repair=core.repairRows(records)[0].repair;
  assert.equal(repair.phases.find(phase=>phase.stage==='revalidate').status,'校验通过');
  const rows=core.processTimeline(records).filter(row=>row.kind==='repair');
  assert.deepEqual(plain(rows.filter(row=>row.stage==='feedback').map(row=>row.error)),[semantic,fixed]);
  assert.equal(rows.find(row=>row.stage==='final').status,'JSON 有效');
});

test('reading an explicit artifact adds no duplicate tool steps while other files remain visible',()=>{
  const path='agent-artifacts/chart.json';
  const records=[record('artifact.stored',{requestId:'create',path,content:'{}',workspaceRevision:1}),
    record('model.response',{messages:[{role:'assistant',content:[{type:'toolCall',id:'read',name:'read_workspace_file',arguments:{path}}]}]}),
    ...toolTrace('read','read_workspace_file',{path},'completed',{excerpt:{path,content:'{}',startLine:1,endLine:1,totalLines:1,workspaceRevision:1}}),
    ...toolTrace('other','read_workspace_file',{path:'notes.txt'},'completed',{content:'notes'})];
  const rows=core.processTimeline(records);
  assert.deepEqual(plain(rows.filter(row=>row.kind==='tool').map(row=>row.callId)),['other']);
  assert.equal(rows.some(row=>row.kind==='assistant'),false);
  assert.deepEqual(plain(rows.filter(row=>row.kind==='repair').map(row=>row.stage)),['write','final']);
});

test('failed patches show the returned error and do not imply a file change',()=>{
  const path='agent-repairs/patch-failed.json',content='{"value":',fields={path,tool:'create_canvas_components',operationId:'op',workspaceRevision:1};
  const error={code:'workspace.invalid',message:'oldText was not found'};
  const records=[record('artifact.stored',{...fields,requestId:'create',content}),
    record('artifact.patch.received',{...fields,requestId:'patch',expectedRevision:1,edits:[{oldText:'missing',newText:'fixed'}]}),
    record('artifact.patch.rejected',{...fields,requestId:'patch',error})];
  const rows=core.processTimeline(records).filter(row=>row.kind==='repair');
  const patch=rows.find(row=>row.stage==='patch');
  assert.equal(patch.status,'未写入');assert.deepEqual(plain(patch.error),error);
  assert.equal(rows.find(row=>row.stage==='final').status,'JSON 仍有错误');
});

test('unconfirmed writes and revision conflicts leave the final JSON unknown',()=>{
  const path='agent-artifacts/uncertain.json',fields={path,tool:'create_canvas_components',operationId:'op'};
  const staged=[record('artifact.stored',{...fields,requestId:'begin',mode:'staged',content:'{"value":',workspaceRevision:1}),
    record('artifact.write.received',{...fields,requestId:'write',content:'1}',expectedRevision:1})];
  const pending=core.processTimeline(staged).filter(row=>row.kind==='repair');
  assert.equal(pending.find(row=>row.stage==='write').status,'写入未确认');
  assert.equal(pending.find(row=>row.stage==='final').status,'JSON 未确认');

  const conflicted=[record('artifact.stored',{...fields,requestId:'create',content:'{"value":',workspaceRevision:1}),
    record('artifact.patch.received',{...fields,requestId:'patch',expectedRevision:1,edits:[{oldText:'value',newText:'value'}]}),
    record('artifact.patch.rejected',{...fields,requestId:'patch',error:{code:'workspace.revision_conflict',actualRevision:3}})];
  const conflict=core.processTimeline(conflicted).filter(row=>row.kind==='repair');
  assert.equal(conflict.find(row=>row.stage==='patch').status,'未写入');
  assert.equal(conflict.find(row=>row.stage==='final').status,'JSON 未确认');
});

test('a validation for another revision cannot validate or display an old final snapshot',()=>{
  const path='agent-artifacts/stale.json';
  const records=[record('artifact.stored',{requestId:'create',path,content:'{}',workspaceRevision:1}),
    record('artifact.validation.passed',{requestId:'validate',path,stage:'syntax',workspaceRevision:2})];
  const final=core.artifactView(records)[0].repair.phases.at(-1);
  assert.equal(final.status,'JSON 未确认');assert.equal(final.after,undefined);
});

test('frontend submission preserves the final snapshot when only its workspace revision advances',()=>{
  const path='agent-artifacts/submitted.json',fields={path,tool:'render_draft',operationId:'op',contentSha256:'same-content'};
  for(const redacted of [false,true]) {
    const content=redacted ? '[redacted]' : '{"components":[]}';
    const records=[record('artifact.stored',{...fields,requestId:'begin',mode:'staged',content:'',workspaceRevision:1}),
      record('artifact.read',{...fields,requestId:'submit',content,contentRedacted:redacted,workspaceRevision:4}),
      record('artifact.validation.passed',{...fields,requestId:'submit',stage:'syntax',workspaceRevision:4}),
      record('artifact.frontend.submitted',{...fields,requestId:'submit',status:'pending',workspaceRevision:5}),
      record('frontend.effect.completed',{operationId:'op',toolCallId:'submit',status:'applied'})];
    const final=core.processTimeline(records).find(row=>row.stage==='final');
    assert.equal(final.status,'JSON 有效');assert.equal(final.after,content);
  }
});

test('a newer workspace revision with a different or missing hash cannot reuse the old snapshot',()=>{
  const path='agent-artifacts/changed-after-read.json';
  for(const contentSha256 of ['different-content',undefined]) {
    const records=[record('artifact.stored',{requestId:'create',path,content:'{}',workspaceRevision:1,contentSha256:'original-content'}),
      record('artifact.validation.passed',{requestId:'validate',path,stage:'syntax',workspaceRevision:1,contentSha256:'original-content'}),
      record('artifact.frontend.submitted',{requestId:'submit',path,status:'pending',workspaceRevision:2,contentSha256})];
    const final=core.processTimeline(records).find(row=>row.stage==='final');
    assert.equal(final.status,'JSON 未确认');assert.equal(final.after,undefined);
  }
});

test('a rejected patch does not imply that already valid JSON was repaired',()=>{
  const path='agent-artifacts/valid.json',fields={path,workspaceRevision:1};
  const records=[record('artifact.stored',{...fields,requestId:'create',content:'{"a":1}'}),
    record('artifact.patch.received',{...fields,requestId:'patch',edits:[{oldText:'missing',newText:'fixed'}]}),
    record('artifact.patch.rejected',{...fields,requestId:'patch',error:{code:'workspace.invalid',message:'not found'}})];
  assert.equal(core.artifactView(records)[0].status,'JSON 有效');
});

test('reading the same redacted snapshot preserves its confirmed JSON validation',()=>{
  const path='agent-artifacts/redacted.json',fields={path,workspaceRevision:1};
  const records=[record('artifact.stored',{...fields,requestId:'create',content:'[redacted]',contentRedacted:true}),
    record('artifact.validation.passed',{...fields,requestId:'validate',stage:'syntax'}),
    record('artifact.read',{...fields,requestId:'read',content:'[redacted]',contentRedacted:true})];
  assert.equal(core.artifactView(records)[0].status,'JSON 有效');
});

test('actual patch rejection does not invent file changes or a subsequent validation',()=>{
  const path='agent-repairs/failed.txt',content='broken',fields={path,operationId:'op',workspaceRevision:1};
  const records=[record('artifact.stored',{...fields,requestId:'create',content}),
    record('artifact.patch.received',{...fields,requestId:'patch',expectedRevision:1,edits:[{oldText:'missing',newText:'fixed'}]}),
    record('artifact.patch.rejected',{...fields,requestId:'patch',error:{code:'workspace.invalid',message:'not found'}})];
  const row=core.repairRows(records)[0];
  assert.equal(row.repair.finalContent,content);assert.equal(row.status,'应用失败');
  assert.deepEqual(plain(row.repair.phases.map(p=>p.stage)),['store','patch','apply']);
});

test('completed artifact processing segments do not trigger an incomplete runtime warning',()=>{
  const fields={segmentId:'artifact-segment'};
  const complete=[record('artifact.received',{requestId:'create'},{...fields,sequence:1}),
    record('artifact.stored',{requestId:'create',path:'a',content:'{}'},{...fields,sequence:2}),
    record('artifact.processing.ended',{requestId:'create'},{...fields,sequence:3})];
  assert.deepEqual(plain(core.warnings(complete)),[]);
  assert.ok(core.warnings(complete.slice(0,2)).some(w=>w.includes('缺少结尾')));
});

test('keeps valid records before and after malformed or truncated entries',()=>{
  const a=record('segment.started'),b=record('segment.ended');
  const parsed=core.parse(`${prefix}${JSON.stringify(a)}\n${prefix}{"broken":\n${prefix}${JSON.stringify(b)}\n${prefix}{"tail":`);
  assert.equal(parsed.records.length,2);assert.equal(parsed.warnings.length,2);
});

test('merges rotated files by record ID and round trips exported JSON',()=>{
  const a=record('segment.started'),b=record('segment.ended');
  const merged=core.merge([a],[a,b]);assert.equal(merged.added,1);assert.equal(merged.records.length,2);
  const restored=core.parse(JSON.stringify({schemaVersion:'datavisool-agent-trace-export/v1',records:merged.records}));
  assert.deepEqual(plain(restored.records),[a,b]);
});

test('supports JSONL and legacy history without name based guessing',()=>{
  assert.equal(core.parse([record('segment.started'),record('segment.ended')].map(JSON.stringify).join('\n')).records.length,2);
  assert.equal(core.parse(JSON.stringify(record('segment.started', {}, {schemaVersion:'lcp-agent-trace/v1'}))).records.length,1);
  const desktop={schemaVersion:'lcp-agent-history/v1',runId:'desktop',messages:[{role:'assistant',content:[{type:'toolCall',id:'a',function:{name:'read',arguments:'{"path":"a"}'}}]}],toolExecutions:[{toolCallId:'different',toolName:'read',arguments:{path:'b'},result:'b',outcome:'success'}]};
  const parsed=core.parse('==================完整历史================='+JSON.stringify(desktop));
  const rows=core.timeline(parsed.records);assert.equal(rows.length,3);
  assert.deepEqual(plain(rows[0].details.find(d=>d[0]==='模型返回原始结构（日志记录）')[1]),desktop.messages[0]);
  assert.equal(rows[1].details.find(d=>d[0]==='说明')[1],'日志中未记录执行结果。');
});

test('orders interleaved records by sequence and causal links despite reversed import and clocks',()=>{
  const a=record('segment.started',{checkpointVersion:0},{segmentId:'one',sequence:1,recordedAt:'2026-10-08T03:00:00Z'});
  const b=record('segment.ended',{}, {segmentId:'one',sequence:2,recordedAt:'2026-10-08T01:00:00Z'});
  const c=record('segment.started',{checkpointVersion:5},{segmentId:'two',sequence:1,recordedAt:'2026-10-08T00:00:00Z'});
  assert.deepEqual(plain(core.order([c,b,a])).map(r=>r.recordId),[a.recordId,b.recordId,c.recordId]);
  const d=record('segment.started',{previousRunId:'run'},{runId:'next',segmentId:'three',sequence:1,recordedAt:'2026-10-07T00:00:00Z'});
  assert.deepEqual(plain(core.order([d,c,b,a])).map(r=>r.recordId),[a.recordId,b.recordId,c.recordId,d.recordId]);
});

test('associates identical tools by ID and uses the final browser result in one tool row',()=>{
  const records=[record('tool.requested',{requestId:'a',name:'read',arguments:{path:'a'}}),record('tool.requested',{requestId:'b',name:'read',arguments:{path:'b'}}),record('tool.completed',{requestId:'b',name:'read',status:'completed',result:{content:'B'}}),record('tool.completed',{requestId:'a',name:'read',status:'completed',result:{content:'A'}}),record('tool.requested',{requestId:'write',name:'patch'}),record('tool.completed',{requestId:'write',status:'pending',result:{operationId:'op'},requiresFrontendEffect:true})];
  let rows=core.timeline(records).filter(r=>r.kind==='tool');assert.equal(rows[0].details.find(d=>d[0]==='执行结果')[1].content,'A');assert.equal(rows[1].details.find(d=>d[0]==='执行结果')[1].content,'B');assert.equal(rows[2].status,'等待执行结果');
  records.push(record('frontend.effect.completed',{operationId:'op',toolCallId:'write',status:'applied',result:{revision:'2'}}));
  rows=core.timeline(records).filter(r=>r.kind==='tool');assert.equal(rows[2].status,'已完成');
  assert.deepEqual(plain(rows[2].details.find(d=>d[0]==='执行结果')[1]),{revision:'2'});
  const wrongRun=record('frontend.effect.completed',{operationId:'op',status:'rejected'},{runId:'other'});assert.equal(core.timeline([...records,wrongRun]).filter(r=>r.kind==='tool')[2].status,'已完成');
});

test('exposes main, summary, fallback and missing responses as separate model attempts',()=>{
  const requests=[record('model.request',{callId:'main',round:1,purpose:'main',mode:'streaming',messages:['main input']}),record('model.failed',{callId:'main',message:'timeout'}),record('model.request',{callId:'summary',round:2,purpose:'summary',mode:'synchronous',messages:['summary input']}),record('model.request',{callId:'retry',round:1,purpose:'main',mode:'fallback',messages:['main input']})];
  const rows=core.requestRows(requests);assert.equal(rows.length,3);assert.ok(rows[0].details.some(d=>d[0]==='调用错误'));assert.ok(rows[1].title.includes('上下文摘要'));assert.ok(rows[2].details.some(d=>d[0]==='提示'));
});

test('attaches reasoning to the reply and marks deferred and incomplete execution',()=>{
  const records=[record('segment.started',{checkpointVersion:0},{segmentId:'s',sequence:1}),record('model.response',{callId:'c',messages:[{role:'assistant',content:[{type:'reasoning',text:'analysis'},{type:'text',text:'reply'},{type:'toolCall',id:'d',name:'patch',arguments:{}}]}]},{segmentId:'s',sequence:3}),record('tool.deferred',{requestId:'d',name:'patch',result:{message:'barrier'}})];
  const rows=core.timeline(records);assert.ok(rows.some(r=>r.kind==='assistant' && r.reasoning==='analysis' && r.text==='reply'));assert.equal(rows.filter(r=>r.kind==='tool').length,1);assert.equal(rows.find(r=>r.kind==='tool').status,'未执行');assert.ok(core.warnings(records).some(w=>w.includes('缺少部分')));
});

test('keeps committed process order when resumed segment starts before the previous tail is logged',()=>{
  const fields={processId:'process'};
  const a=record('segment.started',{checkpointVersion:0},{...fields,processOrder:1,segmentId:'old',sequence:1});
  const b=record('segment.started',{checkpointVersion:2},{...fields,processOrder:2,segmentId:'new',sequence:1});
  const c=record('segment.ended',{}, {...fields,processOrder:3,segmentId:'old',sequence:2});
  const d=record('segment.ended',{}, {...fields,processOrder:4,segmentId:'new',sequence:2});
  const ordered=core.order([d,c,b,a]);assert.deepEqual(plain(ordered).map(r=>r.recordId),[a.recordId,b.recordId,c.recordId,d.recordId]);assert.equal(ordered.orderingConflict,undefined);
});

test('preserves valid exported items when one item has an unsupported schema',()=>{
  const a=record('segment.started'),b=record('segment.ended');
  const parsed=core.parse(JSON.stringify({records:[a,{schemaVersion:'unknown'},b]}));assert.equal(parsed.records.length,2);assert.equal(parsed.warnings.length,1);
});

test('keeps a tool return even when cancellation prevents a committed tool result',()=>{
  const records=[record('tool.requested',{requestId:'last',name:'read'}),record('tool.returned',{requestId:'last',name:'read',status:'completed',result:{content:'last return'}}),record('run.cancelled')];
  const row=core.timeline(records).find(r=>r.kind==='tool');assert.equal(row.status,'已完成');assert.equal(row.details.find(d=>d[0]==='执行结果')[1].content,'last return');
});

test('groups service events without projectId with runtime traces from the same thread and turn',()=>{
  const requested=record('tool.requested',{requestId:'patch',name:'patch'});
  const completed=record('tool.completed',{requestId:'patch',status:'pending',result:{operationId:'op'},requiresFrontendEffect:true});
  const receipt=record('frontend.effect.completed',{operationId:'op',status:'applied'},{projectId:undefined,source:'service',eventSequence:10});
  const groups=core.groups([requested,completed,receipt]);assert.equal(groups.length,1);assert.equal(core.timeline(groups[0].records).find(r=>r.kind==='tool').status,'已完成');
});

test('the complete example shows every model return before its calls with final results',()=>{
  const parsed=core.parse(readFileSync(`${__dirname}/agent-trace-example.log`,'utf8'));
  const records=core.groups(parsed.records)[0].records, rows=core.timeline(records);
  assert.deepEqual(plain(rows.map(r=>r.kind)),['system','user','assistant','tool','assistant','tool','assistant']);
  assert.deepEqual(plain(rows.map(r=>r.step)),[1,2,3,4,5,6,7]);
  assert.equal(rows[0].text,'你是画布编辑 Agent。写操作必须依据浏览器真实回执继续。');
  assert.equal(rows[1].text,'读取销售数据，创建销售额柱状图。');
  assert.equal(rows[2].text,'我会先读取数据，再创建图表。');
  assert.equal(rows[2].reasoning,'先核对数据字段，再按月份创建图表。');
  assert.equal(rows[4].title,'Agent 返回（方法调用）');
  assert.deepEqual(plain(rows[5].details.find(d=>d[0]==='执行结果')[1]),{componentIds:['sales-chart'],revision:'2'});
  assert.equal(rows[5].status,'已完成');
  assert.equal(core.summary(records).status,'已完成');
  assert.equal(rows.filter(r=>r.kind==='user').length,1);
});

test('pending is a wait, and a failed browser receipt is the single final result without guard metadata',()=>{
  const initial={operationId:'op',status:'pending',guard:{repeatCount:1}};
  const records=[record('tool.requested',{requestId:'c',name:'get_project_snapshot',arguments:{}}),record('tool.returned',{requestId:'c',result:{operationId:'op',status:'pending'},status:'pending',requiresFrontendEffect:true}),record('tool.completed',{requestId:'c',result:initial,status:'pending',requiresFrontendEffect:true})];
  const waiting=core.timeline(records)[0];
  assert.equal(waiting.status,'等待执行结果');
  assert.equal(waiting.details.find(d=>d[0]==='执行结果')[1],undefined);
  records.push(record('frontend.effect.completed',{operationId:'op',status:'failed',result:{code:'read_failed',message:'读取失败'}}));
  const rows=core.timeline(records);assert.equal(rows.length,1);assert.equal(rows[0].status,'失败');
  assert.deepEqual(plain(rows[0].details.find(d=>d[0]==='执行结果')[1]),{code:'read_failed',message:'读取失败'});
  assert.equal(rows[0].debug.checkedReturn.result.guard.repeatCount,1);
  assert.equal(initial.guard.repeatCount,1);
});

test('receipts can match by tool call ID even if the initial return is missing',()=>{
  const records=[record('tool.requested',{requestId:'c',name:'read',arguments:{}}),record('frontend.effect.completed',{operationId:'op',toolCallId:'c',status:'applied',result:{data:[1]}})];
  const rows=core.timeline(records);assert.equal(rows.length,1);assert.equal(rows[0].status,'已完成');
  assert.deepEqual(plain(rows[0].details.find(d=>d[0]==='执行结果')[1]),{data:[1]});
});

test('user media parts are kept together and steering is shown once, without runtime notices or summaries',()=>{
  const records=[record('context.initialized',{messages:[{role:'user',content:[{type:'text',text:'创建图表'},{type:'omitted',text:'[媒体内容已省略]'}]}]}),
    record('context.appended',{reason:'completion_check',messages:[{role:'user',content:'请继续调用工具'}]}),
    record('context.appended',{reason:'steer',steerVersion:1,messages:[{role:'user',content:'用户在运行中追加要求：改成折线图'}]}),
    record('context.appended',{reason:'steer',steerVersion:1,messages:[{role:'user',content:'用户在运行中追加要求：改成折线图'}]}),
    record('context.initialized',{messages:[{role:'user',content:'创建图表'},{role:'user',content:'[Agent runtime notice] 已恢复'}]}),
    record('model.request',{callId:'summary',purpose:'summary'}),record('model.response',{callId:'summary',messages:[{role:'assistant',content:'旧状态摘要'}]})];
  const rows=core.timeline(records);
  assert.deepEqual(plain(rows.map(r=>r.text)),['创建图表\n\n[媒体内容已省略]','改成折线图']);
});

test('legacy tool results attach to the matching call even without execution entries',()=>{
  const parsed=core.parse(JSON.stringify({runId:'desktop',messages:[{role:'system',content:'内部提示词'},{role:'user',content:'读取文件'},
    {role:'assistant',content:[{type:'reasoning',text:'先读取'},{type:'text',text:'开始读取'},{type:'toolCall',id:'a',function:{name:'read',arguments:{path:'a'}}}]},
    {role:'user',content:[{type:'toolResult',id:'a',content:[{type:'text',text:'{"content":"A"}'}]}]},
    {role:'assistant',content:'已读取'}]}));
  const rows=core.timeline(parsed.records);
  assert.deepEqual(plain(rows.map(r=>r.kind)),['system','user','assistant','tool','assistant']);
  assert.equal(rows[0].text,'内部提示词');
  assert.deepEqual(plain(rows[3].details.find(d=>d[0]==='执行结果')[1]),{content:'A'});
  assert.equal(rows[3].status,'已返回结果');
});

test('a model tool declaration precedes execution even when timestamps are reversed',()=>{
  const response=record('model.response',{messages:[{role:'assistant',content:[{type:'text',text:'读取快照'},{type:'toolCall',id:'a',name:'read',arguments:{}}]}]},{recordedAt:'2026-10-08T03:00:00Z'});
  const request=record('tool.requested',{requestId:'a',name:'read',arguments:{}},{recordedAt:'2026-10-08T01:00:00Z'});
  const completed=record('tool.completed',{requestId:'a',status:'completed',result:{content:'A'}});
  const rows=core.timeline(core.order([completed,request,response]));
  assert.deepEqual(plain(rows.map(r=>r.kind)),['assistant','tool']);
});

test('analysis and tool-only model returns remain visible before tool execution',()=>{
  const records=[record('model.response',{messages:[{role:'assistant',content:[{type:'reasoning',text:'先读取画布'},{type:'toolCall',id:'a',name:'read',arguments:{}}]}]}),
    record('tool.requested',{requestId:'a',name:'read',arguments:{}}),record('tool.completed',{requestId:'a',status:'completed',result:{components:[]}})];
  const rows=core.timeline(records);assert.deepEqual(plain(rows.map(row=>row.kind)),['assistant','tool']);
  assert.equal(rows[0].reasoning,'先读取画布');assert.equal(rows[1].reasoning,'先读取画布');
  assert.deepEqual(plain(rows[0].details.find(d=>d[0]==='模型返回原始结构（日志记录）')[1]),records[0].payload);
});

test('preserves the complete model response and separates declared arguments from actual execution',()=>{
  const payload={callId:'model-catalog',responseId:'response-id',modelName:'test-model',finishReason:'TOOL_EXECUTION',usage:{inputTokens:10,outputTokens:20,totalTokens:30},
    messages:[{role:'assistant',content:[{type:'text',text:'我先获取组件目录确认可用类型。'},
      {type:'toolCall',id:'catalog',name:'get_component_catalog',arguments:'{"category":"all"}'}]}]};
  const response=record('model.response',payload), original=JSON.stringify(payload);
  const records=[response,record('tool.requested',{requestId:'catalog',name:'get_component_catalog',arguments:{category:'chart'}}),
    record('tool.completed',{requestId:'catalog',status:'completed',result:{categories:['chart']}})];
  const rows=core.processTimeline(records);
  assert.deepEqual(plain(rows.map(row=>row.kind)),['assistant','tool']);
  assert.equal(rows[0].text,'我先获取组件目录确认可用类型。');
  assert.deepEqual(plain(rows[0].details.find(([label])=>label==='模型返回原始结构（日志记录）')[1]),payload);
  assert.deepEqual(plain(rows[0].details.find(([label])=>label.startsWith('模型要求的方法调用'))[1]),[{id:'catalog',name:'get_component_catalog',arguments:{category:'all'}}]);
  assert.deepEqual(plain(rows[1].details.find(([label])=>label==='调用参数')[1]),{category:'chart'});
  assert.equal(rows[1].status,'已完成');assert.equal(JSON.stringify(payload),original);
});

test('one tool-only model response precedes multiple executed or deferred calls despite reversed clocks',()=>{
  const response=record('model.response',{callId:'batch',messages:[{role:'assistant',content:[
    {type:'toolCall',id:'first',name:'read',arguments:{path:'first'}},
    {type:'toolCall',id:'second',name:'read',arguments:{path:'second'}}]}]},{recordedAt:'2026-10-08T03:00:00Z'});
  const first=record('tool.requested',{requestId:'first',name:'read',arguments:{path:'first'}},{recordedAt:'2026-10-08T01:00:00Z'});
  const second=record('tool.deferred',{requestId:'second',name:'read',arguments:{path:'second'}},{recordedAt:'2026-10-08T02:00:00Z'});
  const records=core.order([first,response,second]), rows=core.timeline(records);
  assert.deepEqual(plain(rows.map(row=>row.kind)),['assistant','tool','tool']);
  assert.equal(rows[0].title,'Agent 返回（方法调用）');
  assert.equal(rows[0].details.find(([label])=>label.startsWith('模型要求的方法调用'))[1].length,2);
  assert.equal(rows[1].callId,'first');assert.equal(rows[2].callId,'second');assert.equal(rows[2].status,'未执行');
  assert.equal(core.summary(records).replies,0);assert.equal(core.summary(records).tools,2);
});

test('a textual intention without a tool call is not displayed as a declared method call',()=>{
  const response=record('model.response',{messages:[{role:'assistant',content:'我先获取组件的全部分类。'}]});
  const rows=core.timeline([response]);assert.equal(rows.length,1);assert.equal(rows[0].kind,'assistant');
  assert.equal(rows[0].details.some(([label])=>label.startsWith('模型要求的方法调用')),false);
  assert.deepEqual(plain(rows[0].details.find(([label])=>label==='模型返回原始结构（日志记录）')[1]),response.payload);
});

test('a failed tool return is not presented as waiting even when it was routed to the browser',()=>{
  const records=[record('tool.requested',{requestId:'a',name:'read',arguments:{}}),record('tool.completed',{requestId:'a',status:'failed',requiresFrontendEffect:true,result:{code:'dispatch_failed'}})];
  const row=core.timeline(records)[0];assert.equal(row.status,'失败');assert.equal(row.details.find(d=>d[0]==='执行结果')[1].code,'dispatch_failed');
});

test('resuming a previously failed run does not inherit its final status',()=>{
  const records=[record('run.failed',{message:'timeout'}),record('segment.started',{previousRunId:'run'},{runId:'new-run'})];
  assert.equal(core.summary(records).status,'未记录任务结束');assert.equal(core.summary(records).error,undefined);
});

test('system prompts keep all parts and only reappear when the active prompt changes',()=>{
  const prompt=text=>({role:'system',content:[{type:'text',text}, {type:'text',text:'共同约束'}]});
  const records=[record('context.initialized',{messages:[prompt('规则 A'),{role:'user',content:'读取画布'}]}),
    record('model.request',{purpose:'main',messages:[prompt('规则 A')]}),
    record('context.initialized',{messages:[prompt('规则 A')]},{runId:'resumed'}),
    record('model.request',{purpose:'main',messages:[prompt('规则 B')]},{runId:'resumed'}),
    record('model.request',{purpose:'main',messages:[prompt('规则 A')]},{runId:'resumed'})];
  const rows=core.timeline(records);
  assert.deepEqual(plain(rows.map(r=>r.kind)),['system','user','system','system']);
  assert.deepEqual(plain(rows.filter(r=>r.kind==='system').map(r=>r.text)),['规则 A\n\n共同约束','规则 B\n\n共同约束','规则 A\n\n共同约束']);
  assert.equal(rows[2].title,'系统提示词已更新');
});

test('summary model prompts are visible without changing the main model prompt or replaying user input',()=>{
  const records=[record('model.request',{purpose:'main',messages:[{role:'system',content:'主模型规则'},{role:'user',content:'创建组件'}]}),
    record('model.request',{purpose:'summary',messages:[{role:'system',content:'压缩规则'},{role:'user',content:'旧运行历史'}]}),
    record('model.request',{purpose:'main',messages:[{role:'system',content:'主模型规则'},{role:'user',content:'创建组件'}]})];
  const rows=core.timeline(records);assert.equal(rows.length,3);
  assert.equal(rows[0].title,'系统提示词');assert.equal(rows[2].title,'摘要模型系统提示词');
  assert.equal(rows[2].text,'压缩规则');assert.equal(rows.filter(r=>r.kind==='user').length,1);
});

test('desktop preamble is shown even when no system message is stored and is not duplicated when both exist',()=>{
  for (const systemMessage of [[],[{role:'system',content:'桌面完整提示词'}]]) {
    const parsed=core.parse(JSON.stringify({runId:'desktop',systemPreamble:'桌面完整提示词',messages:[...systemMessage,{role:'user',content:'读取文件'}]}));
    const rows=core.timeline(parsed.records);assert.equal(rows.length,2);assert.equal(rows[0].kind,'system');assert.equal(rows[0].text,'桌面完整提示词');
  }
});

const toolTrace = (id,name,args,status,result,fields={}) => [
  record('tool.requested',{requestId:id,name,arguments:args},fields),
  record('tool.completed',{requestId:id,name,status,result},fields)
];
const repairPath='agent-repairs/card.txt';
const brokenCard='[{"id":"g","config":{"data":{"staticData":{"value":0.92}}}]';
const syntaxResult=(path=repairPath,revision=1)=>({code:'artifact_json_invalid',repairTool:'repair_artifact',path,workspaceRevision:revision,artifactUpdated:true,error:'expected }',charOffset:brokenCard.length-1,errorContext:brokenCard,contextStartOffset:0});

test('reconstructs the repair chain and distinguishes an unmatched patch from a saved patch blocked by component validation',()=>{
  const records=[
    ...toolTrace('create','create_canvas_components',{components:brokenCard},'repair_required',syntaxResult()),
    ...toolTrace('bad','repair_artifact',{path:repairPath,expectedRevision:1,edits:[{oldText:'0.92}}]',newText:'0.92}}}]'}]},'rejected',{code:'workspace.invalid',message:'oldText does not match'}),
    ...toolTrace('read','read_workspace_file',{path:repairPath},'completed',{excerpt:{path:repairPath,content:brokenCard,startLine:1,endLine:1,totalLines:1,workspaceRevision:1}}),
    ...toolTrace('fix','repair_artifact',{path:repairPath,expectedRevision:1,edits:[{oldText:'0.92}}}]',newText:'0.92}}}}]'}]},'rejected',{code:'agent.component_specs.complete_read_required',path:repairPath,workspaceRevision:2,repairTool:'repair_artifact'}),
    record('run.cancelled')
  ];
  const groups=core.repairRows(records);assert.equal(groups.length,1);
  const repair=groups[0].repair;assert.equal(repair.attempts,2);assert.equal(repair.steps.length,4);
  assert.equal(repair.steps[1].patchStatus,'未生效');assert.equal(repair.steps[1].edits[0].matches,0);
  assert.equal(repair.steps[1].after,brokenCard);
  assert.equal(repair.steps[3].patchStatus,'已保存');assert.equal(repair.steps[3].edits[0].matches,1);
  assert.equal(repair.steps[3].previousRevision,1);assert.equal(repair.finalRevision,2);
  assert.equal(JSON.parse(repair.finalContent)[0].config.data.staticData.value,0.92);
  assert.equal(repair.end.type,'run.cancelled');assert.equal(groups[0].status,'被拦截');
});

test('each patch uses the previously saved version, including patches that leave further syntax errors',()=>{
  const records=[...toolTrace('create','create_canvas_components',{components:'{"a":1'},'repair_required',syntaxResult()),
    ...toolTrace('one','repair_artifact',{path:repairPath,expectedRevision:1,edits:[{oldText:'1',newText:'2'}]},'repair_required',syntaxResult(repairPath,2)),
    ...toolTrace('two','repair_artifact',{path:repairPath,expectedRevision:2,edits:[{oldText:'2',newText:'2}'}]},'applied',{confirmed:true})];
  const repair=core.repairRows(records)[0].repair;
  assert.equal(repair.steps[1].after,'{"a":2');assert.equal(repair.steps[2].before,'{"a":2');
  assert.equal(repair.steps[2].after,'{"a":2}');assert.equal(repair.steps[2].edits[0].matches,1);
});

test('multi-edit patches roll back on failure, count ambiguous overlapping matches, and preserve literal replacement text',()=>{
  let patch=core.applyRepairEdits('aaa x',[{oldText:'x',newText:'y'},{oldText:'aa',newText:'z'}]);
  assert.equal(patch.content,'aaa x');assert.equal(patch.edits[1].matches,2);assert.ok(patch.error);
  patch=core.applyRepairEdits('x',[{oldText:'x',newText:'$&'},{oldText:'$&',newText:'$`'}]);
  assert.equal(patch.content,'$`');assert.equal(patch.error,'');
});

test('missing results and missing original text never produce a fictitious saved artifact',()=>{
  const records=[...toolTrace('create','create_canvas_components',{components:brokenCard},'repair_required',syntaxResult()),
    record('tool.requested',{requestId:'lost',name:'repair_artifact',arguments:{path:repairPath,expectedRevision:1,edits:[{oldText:'0.92}}}]',newText:'0.92}}}}]'}]}})];
  let repair=core.repairRows(records)[0].repair;
  assert.equal(repair.steps[1].patchStatus,'未确认保存');assert.equal(repair.steps[1].after,undefined);assert.equal(repair.finalContent,undefined);
  repair=core.repairRows(toolTrace('orphan','repair_artifact',{path:repairPath,expectedRevision:1,edits:[{oldText:'a',newText:'b'}]},'repair_required',syntaxResult()))[0].repair;
  assert.equal(repair.steps[0].before,undefined);assert.equal(repair.steps[0].after,undefined);assert.equal(repair.steps[0].edits[0].matches,undefined);
});

test('revision conflicts invalidate old content and partial reads cannot replace a complete artifact',()=>{
  const records=[...toolTrace('create','create_canvas_components',{components:brokenCard},'repair_required',syntaxResult()),
    ...toolTrace('conflict','repair_artifact',{path:repairPath,expectedRevision:1,edits:[{oldText:'0.92}}}]',newText:'0.92}}}}]'}]},'rejected',{code:'workspace.revision_conflict',actualRevision:3}),
    ...toolTrace('part','read_workspace_file',{path:repairPath},'completed',{excerpt:{path:repairPath,content:'fragment',startLine:2,endLine:2,totalLines:3,workspaceRevision:3}})];
  const group=core.repairRows(records)[0];
  assert.equal(group.repair.steps[1].patchStatus,'未生效');assert.equal(group.repair.steps[1].after,undefined);
  assert.equal(group.repair.finalContent,undefined);assert.equal(group.repair.finalRevision,3);assert.equal(group.status,'应用失败');
});

test('repairs are scoped by run and browser results complete the original repair without duplicate steps',()=>{
  const records=[...toolTrace('create','create_canvas_components',{components:'{"a":1'},'repair_required',syntaxResult()),
    ...toolTrace('fix','repair_artifact',{path:repairPath,expectedRevision:1,edits:[{oldText:'1',newText:'1}'}]},'pending',{operationId:'op'}),
    record('frontend.effect.completed',{operationId:'op',toolCallId:'fix',status:'applied',result:{confirmed:true}}),
    ...toolTrace('other','repair_artifact',{path:repairPath,expectedRevision:1,edits:[{oldText:'1',newText:'1}'}]},'repair_required',syntaxResult(),{runId:'other'})];
  const groups=core.repairRows(records);assert.equal(groups.length,2);
  assert.equal(groups[0].repair.steps.length,2);assert.equal(groups[0].repair.steps[1].patchStatus,'已保存');
  assert.equal(groups[0].repair.finalContent,'{"a":1}');assert.equal(groups[0].status,'执行完成');
  assert.equal(groups[1].repair.steps[0].before,undefined);
});

test('legacy result envelopes expose repair paths and preserve unformatted source text',()=>{
  const source=' { "a": 1';
  const parsed=core.parse(JSON.stringify({runId:'desktop',messages:[
    {role:'assistant',content:[{type:'toolCall',id:'create',name:'create_canvas_components',arguments:{components:source}}]},
    {role:'tool',content:[{type:'toolResult',id:'create',name:'create_canvas_components',result:{requestId:'create',status:'repair_required',result:syntaxResult()}}]}
  ]}));
  const groups=core.repairRows(parsed.records);assert.equal(groups.length,1);assert.equal(groups[0].repair.finalContent,source);
  const process=core.processTimeline(parsed.records),visible=process.filter(row=>row.kind==='repair');
  assert.deepEqual(plain(visible.map(row=>row.stage)),['write','feedback','final']);
  assert.equal(visible.find(row=>row.stage==='write').content,source);
  assert.equal(process.some(row=>row.kind==='assistant'),false);
});

test('the default process keeps Agent prose and shows only file writes, returned errors, patches and final JSON',()=>{
  const response=record('model.response',{messages:[{role:'assistant',content:[{type:'text',text:'我先创建文件。'},{type:'toolCall',id:'create',name:'create_canvas_components',arguments:{components:brokenCard}}]}]},{recordedAt:'2026-10-09T11:00:00Z'});
  const traces=toolTrace('create','create_canvas_components',{components:brokenCard},'repair_required',syntaxResult());
  traces[0].recordedAt='2026-10-09T11:00:01Z';traces[1].recordedAt='2026-10-09T11:00:02Z';
  const records=[response,...traces,...toolTrace('patch','repair_artifact',{path:repairPath,expectedRevision:1,edits:[{oldText:'0.92}}}]',newText:'0.92}}}}]'}]},'rejected',{code:'agent.component_specs.complete_read_required',path:repairPath,workspaceRevision:2})];
  const process=core.processTimeline(records), rows=process.filter(row=>row.kind==='repair');
  assert.equal(process[0].kind,'assistant');assert.equal(process[0].record,response);assert.equal(process[0].text,'我先创建文件。');
  assert.deepEqual(plain(rows.map(row=>row.stage)),['write','feedback','patch','feedback','final']);
  assert.equal(rows[0].content,brokenCard);assert.equal(rows[0].status,'已写入');
  assert.equal(rows[1].status,'校验失败');
  assert.equal(rows[2].status,'已写入');assert.deepEqual(plain(rows[2].edits),[{oldText:'0.92}}}]',newText:'0.92}}}}]',matches:1,issue:''}]);
  assert.equal(rows[3].error.code,'agent.component_specs.complete_read_required');
  assert.equal(rows[4].status,'JSON 已修复');
  assert.ok(rows.every(row=>row.artifactId==='R1'));assert.equal(process.filter(row=>row.kind==='tool').length,0);
  assert.equal(core.summary(records).tools,2);
});

test('a rejected patch exposes its failure and explicitly marks revalidation as not executed',()=>{
  const records=[...toolTrace('create','create_canvas_components',{components:brokenCard},'repair_required',syntaxResult()),
    ...toolTrace('patch','repair_artifact',{path:repairPath,expectedRevision:1,edits:[{oldText:'missing',newText:'fixed'}]},'rejected',{code:'workspace.invalid',message:'oldText mismatch'})];
  const phases=core.repairRows(records)[0].repair.phases;
  assert.equal(phases.find(row=>row.stage==='apply').status,'应用失败');
  const validation=phases.find(row=>row.stage==='revalidate');assert.equal(validation.status,'未执行');assert.equal(validation.error,undefined);
  assert.equal(phases.some(row=>row.stage==='continue'),false);
});

test('a saved but still invalid artifact has a failed revalidation rather than a successful continuation',()=>{
  const records=[...toolTrace('create','create_canvas_components',{components:'{"a":1'},'repair_required',syntaxResult()),
    ...toolTrace('patch','repair_artifact',{path:repairPath,expectedRevision:1,edits:[{oldText:'1',newText:'2'}]},'repair_required',syntaxResult(repairPath,2))];
  const phases=core.repairRows(records)[0].repair.phases;
  assert.equal(phases.find(row=>row.stage==='apply').status,'应用成功');
  assert.equal(phases.find(row=>row.stage==='revalidate').status,'校验失败');
  assert.equal(phases.some(row=>row.stage==='continue'),false);
});

test('new artifact submissions stay separate and never invent a patch for an abandoned artifact',()=>{
  const records=[...toolTrace('one','create_canvas_components',{components:brokenCard},'repair_required',syntaxResult()),
    ...toolTrace('two','create_canvas_components',{components:brokenCard},'repair_required',syntaxResult('agent-repairs/second.txt',2))];
  const groups=core.repairRows(records);assert.equal(groups.length,2);
  assert.deepEqual(plain(groups[0].repair.phases.map(row=>row.stage)),['generate','validate','store','missing']);
  assert.equal(groups[0].repair.phases.at(-1).status,'未记录修复');
  assert.equal(groups[1].repair.phases[0].title,'Agent 生成新产物 R2');
  assert.equal(core.processTimeline(records).some(row=>row.patchId),false);
});

test('missing original arguments do not turn a placeholder label into artifact content',()=>{
  const records=[record('tool.completed',{requestId:'orphan',name:'create_canvas_components',status:'repair_required',result:syntaxResult()})];
  const repair=core.repairRows(records)[0].repair;
  assert.equal(repair.finalContent,undefined);assert.equal(repair.phases[0].status,'内容未记录');
});

test('deferred patch application and missing receipts are distinct from a failed revalidation',()=>{
  const base=toolTrace('create','create_canvas_components',{components:brokenCard},'repair_required',syntaxResult());
  const args={path:repairPath,expectedRevision:1,edits:[{oldText:'0.92}}}]',newText:'0.92}}}}]'}]};
  let rows=core.processTimeline([...base,record('tool.deferred',{requestId:'patch',name:'repair_artifact',arguments:args})]);
  assert.equal(rows.find(row=>row.stage==='patch').status,'未写入');
  assert.equal(rows.find(row=>row.stage==='final').status,'JSON 仍有错误');
  rows=core.processTimeline([...base,record('tool.requested',{requestId:'patch',name:'repair_artifact',arguments:args})]);
  assert.equal(rows.find(row=>row.stage==='patch').status,'写入未确认');
  assert.equal(rows.find(row=>row.stage==='final').status,'JSON 未确认');
});

test('staged artifacts show every applied chunk snapshot and validation remains pending submission',()=>{
  const path='agent-artifacts/chart.json',first='{"components":',complete='{"components":[]}';
  const f={path,tool:'create_canvas_components',operationId:'op'};
  const requested=(requestId,name,arguments_)=>record('tool.requested',{requestId,name,arguments:arguments_});
  const records=[requested('begin','begin_canvas_artifact',{path,tool:f.tool}),
    record('artifact.stored',{...f,requestId:'begin',mode:'staged',content:'',workspaceRevision:1,metadata:{projectId:'p',threadId:'t'}}),
    requested('write-1','write_canvas_artifact',{path,content:first,expectedRevision:1}),
    record('artifact.write.received',{...f,requestId:'write-1',content:first,expectedRevision:1}),
    record('artifact.write.applied',{...f,requestId:'write-1',beforeContent:'',afterContent:first,previousRevision:1,workspaceRevision:2,contentSha256:'sha256-1'}),
    requested('write-2','write_canvas_artifact',{path,content:'[]}',expectedRevision:2}),
    record('artifact.write.received',{...f,requestId:'write-2',content:'[]}',expectedRevision:2}),
    record('artifact.write.applied',{...f,requestId:'write-2',beforeContent:first,afterContent:complete,previousRevision:2,workspaceRevision:3,contentSha256:'sha256-2'}),
    requested('validate','validate_canvas_artifact',{path}),
    record('artifact.validation.received',{...f,requestId:'validate',stage:'request',workspaceRevision:3}),
    record('artifact.read',{...f,requestId:'validate',content:complete,workspaceRevision:3}),
    record('artifact.validation.started',{...f,requestId:'validate',stage:'syntax',workspaceRevision:3}),
    record('artifact.validation.passed',{...f,requestId:'validate',stage:'syntax',workspaceRevision:3}),
    record('artifact.validated',{...f,requestId:'validate',stage:'ready',workspaceRevision:3,contentSha256:'sha256-2'})];
  const group=core.repairRows(records)[0],phases=group.repair.phases;
  assert.deepEqual(plain(phases.map(phase=>phase.stage)),['begin','write','write-applied','write','write-applied','validate-received','read','validate-start','validate','validated']);
  assert.equal(group.repair.mode,'staged');assert.equal(group.repair.finalContent,complete);assert.equal(group.repair.finalRevision,3);
  const snapshots=phases.filter(phase=>phase.stage==='write-applied');
  assert.deepEqual(plain(snapshots.map(phase=>[phase.before,phase.after,phase.previousRevision,phase.revision])),[
    ['',first,1,2],[first,complete,2,3]
  ]);
  assert.deepEqual(plain(snapshots[1].debug),{sourceRecordId:snapshots[1].record.recordId,evidence:'实际处理日志',type:'artifact.write.applied',
    requestId:'write-2',tool:f.tool,operationId:'op',projectId:'p',threadId:'t',turnId:'turn',runId:'run'});
  assert.equal(phases.at(-1).status,'已校验，待提交');assert.equal(phases.at(-1).contentSha256,'sha256-2');
  assert.equal(phases.some(phase=>['dispatch','continue','frontend-result'].includes(phase.stage)),false);
  const process=core.processTimeline(records).filter(phase=>phase.kind==='repair');
  assert.deepEqual(plain(process.map(phase=>phase.stage)),['write','write','final']);
  assert.deepEqual(plain(process.filter(phase=>phase.stage==='write').map(phase=>phase.content)),[first,'[]}']);
  assert.equal(process.at(-1).after,complete);assert.equal(process.at(-1).status,'JSON 有效');
});

test('each staged write chunk keeps its own complete model response, including arguments that differ from the applied text',()=>{
  const path='agent-artifacts/raw-chunks.json',fields={path,tool:'create_canvas_components',operationId:'raw-op'};
  const firstResponse={callId:'response-1',responseId:'model-response-1',modelName:'test-model',finishReason:'TOOL_EXECUTION',usage:{outputTokens:11},
    messages:[{role:'assistant',content:[{type:'text',text:'模型准备写入第一块。'},
      {type:'toolCall',id:'chunk-1',name:'write_canvas_artifact',arguments:JSON.stringify({path,content:'模型参数中的第一块'})}]}]};
  const secondResponse={callId:'response-2',responseId:'model-response-2',modelName:'test-model',finishReason:'TOOL_EXECUTION',usage:{outputTokens:17},
    messages:[{role:'assistant',content:[{type:'text',text:'模型准备写入第二块。'},
      {type:'toolCall',id:'chunk-2',name:'write_canvas_artifact',arguments:JSON.stringify({path,content:'模型参数中的第二块'})}]}]};
  const actualFirst='实际写入的第一块',actualSecond='实际写入的第二块';
  const records=[record('artifact.stored',{...fields,requestId:'begin',mode:'staged',content:'',workspaceRevision:1}),
    record('model.response',firstResponse),
    record('tool.requested',{requestId:'chunk-1',name:'write_canvas_artifact',arguments:{path,content:actualFirst,expectedRevision:1}}),
    record('artifact.write.received',{...fields,requestId:'chunk-1',content:actualFirst,expectedRevision:1}),
    record('artifact.write.applied',{...fields,requestId:'chunk-1',beforeContent:'',afterContent:actualFirst,previousRevision:1,workspaceRevision:2}),
    record('model.response',secondResponse),
    record('tool.requested',{requestId:'chunk-2',name:'write_canvas_artifact',arguments:{path,content:actualSecond,expectedRevision:2}}),
    record('artifact.write.received',{...fields,requestId:'chunk-2',content:actualSecond,expectedRevision:2}),
    record('artifact.write.applied',{...fields,requestId:'chunk-2',beforeContent:actualFirst,afterContent:actualFirst+actualSecond,previousRevision:2,workspaceRevision:3})];
  const artifactWrites=core.artifactView(records).flatMap(group=>group.repair.phases).filter(row=>row.stage==='write');
  assert.deepEqual(plain(artifactWrites.map(row=>row.rawOutput)),[firstResponse,secondResponse]);
  assert.deepEqual(plain(artifactWrites.map(row=>row.content)),[actualFirst,actualSecond]);
  assert.notEqual(artifactWrites[0].rawOutput.messages[0].content[1].arguments,artifactWrites[0].content);
  const processWrites=core.processTimeline(records).filter(row=>row.kind==='repair' && row.stage==='write');
  assert.deepEqual(plain(processWrites.map(row=>row.rawOutput)),[firstResponse,secondResponse]);
});

test('multiple calls in one response share that response and a reused call ID in another run keeps its own response',()=>{
  const firstPath='agent-artifacts/same-response.json',secondPath='agent-artifacts/other-run.json';
  const firstFields={tool:'create_canvas_components',operationId:'multi-op'};
  const batchResponse={callId:'batch-response',responseId:'batch-id',modelName:'test-model',usage:{outputTokens:29},
    messages:[{role:'assistant',content:[{type:'text',text:'一次返回两个写入调用。'},
      {type:'toolCall',id:'shared-id',name:'write_canvas_artifact',arguments:{path:firstPath,content:'模型块 A'}},
      {type:'toolCall',id:'second-id',name:'write_canvas_artifact',arguments:{path:firstPath,content:'模型块 B'}}]}]};
  const otherResponse={callId:'other-response',responseId:'other-id',modelName:'other-model',usage:{outputTokens:3},
    messages:[{role:'assistant',content:[{type:'toolCall',id:'shared-id',name:'write_canvas_artifact',arguments:{path:secondPath,content:'另一轮的模型块'}}]}]};
  const appendWrite=(path,runId,requestId,content,revision)=>[
    record('tool.requested',{requestId,name:'write_canvas_artifact',arguments:{path,content,expectedRevision:revision}},{runId,turnId:`turn-${runId}`}),
    record('artifact.write.received',{path,tool:firstFields.tool,operationId:`op-${runId}`,requestId,content,expectedRevision:revision},{runId,turnId:`turn-${runId}`}),
    record('artifact.write.applied',{path,tool:firstFields.tool,operationId:`op-${runId}`,requestId,beforeContent:'',afterContent:content,previousRevision:revision,workspaceRevision:revision+1},{runId,turnId:`turn-${runId}`})];
  const records=[record('artifact.stored',{path:firstPath,...firstFields,requestId:'begin-one',mode:'staged',content:'',workspaceRevision:1}),
    record('model.response',batchResponse),...appendWrite(firstPath,'run','shared-id','实际块 A',1),...appendWrite(firstPath,'run','second-id','实际块 B',2),
    record('artifact.stored',{path:secondPath,...firstFields,requestId:'begin-two',mode:'staged',content:'',workspaceRevision:1},{runId:'other',turnId:'turn-other'}),
    record('model.response',otherResponse,{runId:'other',turnId:'turn-other'}),
    ...appendWrite(secondPath,'other','shared-id','另一轮实际内容',1)];
  const writes=core.processTimeline(records).filter(row=>row.kind==='repair' && row.stage==='write');
  const firstRun=writes.filter(row=>row.path===firstPath),otherRun=writes.filter(row=>row.path===secondPath);
  assert.deepEqual(plain(firstRun.map(row=>row.rawOutput)),[batchResponse,batchResponse]);
  assert.deepEqual(plain(otherRun.map(row=>row.rawOutput)),[otherResponse]);
});

test('a missing model response leaves rawOutput absent instead of substituting tool arguments',()=>{
  const path='agent-artifacts/unlogged-model-output.json',fields={path,tool:'create_canvas_components',operationId:'missing-output-op'};
  const actualArguments={path,content:'actual tool argument text',expectedRevision:1};
  const records=[record('artifact.stored',{...fields,requestId:'begin',mode:'staged',content:'',workspaceRevision:1}),
    record('tool.requested',{requestId:'unlogged',name:'write_canvas_artifact',arguments:actualArguments}),
    record('artifact.write.received',{...fields,requestId:'unlogged',content:actualArguments.content,expectedRevision:1}),
    record('artifact.write.applied',{...fields,requestId:'unlogged',beforeContent:'',afterContent:actualArguments.content,previousRevision:1,workspaceRevision:2})];
  const artifactWrite=core.artifactView(records).flatMap(group=>group.repair.phases).find(row=>row.stage==='write');
  const processWrite=core.processTimeline(records).find(row=>row.kind==='repair' && row.stage==='write');
  assert.equal(artifactWrite.rawOutput,undefined);assert.equal(processWrite.rawOutput,undefined);
  assert.match(html,/日志未记录本次调用对应的 AI 原始输出/);
});

test('non-staged initial writes and repair patches retain their matching model responses',()=>{
  const path='agent-repairs/raw-output.txt',initialPayload={callId:'create-response',responseId:'create-id',messages:[{role:'assistant',content:[
    {type:'text',text:'生成初始产物。'},{type:'toolCall',id:'create',name:'create_canvas_components',arguments:{components:'模型生成的原始内容'}}]}]};
  const patchPayload={callId:'patch-response',responseId:'patch-id',messages:[{role:'assistant',content:[
    {type:'text',text:'根据错误提交补丁。'},{type:'toolCall',id:'patch',name:'repair_artifact',arguments:{path,expectedRevision:1,edits:[{oldText:'模型参数',newText:'模型替换'}]}}]}]};
  const records=[record('model.response',initialPayload),...toolTrace('create','create_canvas_components',{components:brokenCard},'repair_required',syntaxResult(path)),
    record('model.response',patchPayload),...toolTrace('patch','repair_artifact',{path,expectedRevision:1,edits:[{oldText:'实际原文',newText:'实际修复'}]},'applied',{path,workspaceRevision:2})];
  const artifactRows=core.artifactView(records).flatMap(group=>group.repair.phases).filter(row=>['write','patch'].includes(row.stage));
  assert.deepEqual(plain(artifactRows.map(row=>row.rawOutput)),[initialPayload,patchPayload]);
  assert.notDeepEqual(artifactRows[1].rawOutput.messages[0].content[1].arguments,artifactRows[1].edits);
  const processRows=core.processTimeline(records).filter(row=>row.kind==='repair' && ['write','patch'].includes(row.stage));
  assert.deepEqual(plain(processRows.map(row=>row.rawOutput)),[initialPayload,patchPayload]);
});

test('legacy initial writes and repair patches use the corresponding assistant messages as raw output',()=>{
  const path='agent-repairs/legacy-raw-output.txt';
  const createMessage={role:'assistant',content:[{type:'text',text:'桌面端生成初始产物。'},
    {type:'toolCall',id:'legacy-create',function:{name:'create_canvas_components',arguments:{components:brokenCard}}}]};
  const patchMessage={role:'assistant',content:[{type:'text',text:'桌面端提交修复补丁。'},
    {type:'toolCall',id:'legacy-patch',function:{name:'repair_artifact',arguments:{path,expectedRevision:1,edits:[{oldText:'模型参数',newText:'模型替换'}]}}}]};
  const parsed=core.parse(JSON.stringify({runId:'desktop-raw',messages:[createMessage,
    {role:'user',content:[{type:'toolResult',id:'legacy-create',content:JSON.stringify(syntaxResult(path))}]},
    patchMessage,{role:'user',content:[{type:'toolResult',id:'legacy-patch',content:JSON.stringify({path,workspaceRevision:2})}]}]}));
  const artifactRows=core.artifactView(parsed.records).flatMap(group=>group.repair.phases).filter(row=>['write','patch'].includes(row.stage));
  assert.deepEqual(plain(artifactRows.map(row=>row.rawOutput)),[createMessage,patchMessage]);
  const processRows=core.processTimeline(parsed.records).filter(row=>row.kind==='repair' && ['write','patch'].includes(row.stage));
  assert.deepEqual(plain(processRows.map(row=>row.rawOutput)),[createMessage,patchMessage]);
});

test('rejected staged writes preserve the last confirmed snapshot and rejected submits never imply frontend execution',()=>{
  const path='agent-artifacts/rejected.json',f={path,tool:'create_canvas_components',operationId:'op'};
  const initial='';
  const records=[record('artifact.stored',{...f,requestId:'begin',mode:'staged',content:initial,workspaceRevision:1}),
    record('artifact.write.received',{...f,requestId:'write',content:'{"partial":',expectedRevision:1}),
    record('artifact.write.rejected',{...f,requestId:'write',expectedRevision:1,error:{code:'workspace.invalid',message:'invalid write'}}),
    record('artifact.submit.received',{...f,requestId:'submit',expectedRevision:1}),
    record('artifact.submit.rejected',{...f,requestId:'submit',expectedRevision:1,error:{code:'artifact.not_validated',message:'validate first'}}),
    record('artifact.processing.ended',{requestId:'submit',tool:'create_canvas_components'})];
  const group=core.repairRows(records)[0],phases=group.repair.phases;
  assert.equal(group.repair.finalContent,initial);
  assert.equal(phases.find(phase=>phase.stage==='write-rejected').status,'写入失败');
  assert.equal(phases.find(phase=>phase.stage==='submit-rejected').status,'提交被拒绝');
  assert.equal(phases.at(-1).stage,'processing-ended');
  assert.equal(phases.some(phase=>['dispatch','continue','frontend-result'].includes(phase.stage)),false);
});

test('staged submission stays pending until the browser returns its real result',()=>{
  const path='agent-artifacts/ready.json',f={path,tool:'create_canvas_components',operationId:'op'};
  const records=[record('artifact.stored',{...f,requestId:'begin',mode:'staged',content:'[]',workspaceRevision:4}),
    record('artifact.validated',{...f,requestId:'validate',stage:'ready',workspaceRevision:4,contentSha256:'sha256'}),
    record('tool.requested',{requestId:'submit',name:f.tool,arguments:{path,expectedRevision:4}}),
    record('artifact.submit.received',{...f,requestId:'submit',expectedRevision:4}),
    record('artifact.frontend.requested',{...f,requestId:'submit',payload:{components:[]}}),
    record('artifact.frontend.submitted',{...f,requestId:'submit',status:'pending',result:{operationId:'op'}}),
    record('frontend.effect.completed',{operationId:'op',toolCallId:'submit',status:'applied',result:{componentIds:['chart']}})];
  const phases=core.repairRows(records)[0].repair.phases;
  assert.deepEqual(plain(phases.map(phase=>phase.stage)),['begin','validated','submit','dispatch','continue','frontend-result']);
  assert.equal(phases[1].status,'已校验，待提交');
  assert.equal(phases[4].status,'等待执行结果');
  assert.equal(phases[5].status,'已完成');
  assert.deepEqual(plain(phases[5].details.find(([label])=>label==='浏览器真实回执')[1]),{componentIds:['chart']});
});

test('the raw tool receipt preserves diagnostics and guard metadata without changing the displayed summary',()=>{
  const feedback={code:'invalid_payload',message:'颜色格式错误',fieldPath:'components[1].config.style.color',actualValue:'#7EE0',actualType:'string',expected:{type:'color',pattern:'#RRGGBB'},path:'agent-repairs/a.json',retryable:true,recovery:'修正该字段',guard:{repeatCount:0}};
  const returned={requestId:'c',name:'render_draft',status:'repair_required',result:feedback};
  const row=core.timeline([record('tool.requested',{requestId:'c',name:'render_draft',arguments:{}}),record('tool.completed',returned)])[0];
  assert.deepEqual(plain(row.details.find(([label])=>label==='原始工具回执')[1]),returned);
  assert.equal(row.details.find(([label])=>label==='执行结果')[1].fieldPath,feedback.fieldPath);
});

test('artifact feedback DOM includes every original field, including the recovery and filesystem path',()=>{
  const makeNode=(tag)=>({tag,children:[],append(...children){this.children.push(...children);}});
  const ui=vm.createContext({AgentTraceViewer:core,document:{createElement:makeNode},core,patchEdit:()=>{throw new Error('no edits expected');}});
  const nodeFunction=html.match(/  function node\(tag, className, content\) \{[^\n]+\}/)[0];
  const detailFunction=html.match(/  function detail\([\s\S]*?\n  \}/)[0];
  const phaseFunction=html.match(/  function phaseBody\([\s\S]*?\n  \}/)[0];
  vm.runInContext(nodeFunction+'\n'+detailFunction+'\n'+phaseFunction+'\nglobalThis.renderPhase=phaseBody;',ui);
  const feedback={code:'agent.operation.style_patch_not_allowed',message:'color 格式不合法',fieldPath:'components[0].config.style.color',actualValue:'#7EE0',actualType:'string',expected:{type:'color'},path:'agent-repairs/a.json',workspaceRevision:4,contentSha256:'sha',repairTool:'repair_artifact',artifactUpdated:true,retryable:true,recovery:'读取文件后修复',contextStartOffset:120,errorContext:'color: #7EE0',guard:{repeatCount:0}};
  const body=ui.renderPhase({stage:'feedback',error:feedback});
  const details=body.children.find(child=>child.tag==='details');
  assert.equal(details.children[0].textContent,'返回给 Agent 的原始反馈');
  assert.deepEqual(JSON.parse(details.children[1].textContent),feedback);
});
