/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({build: vi.fn(), post: vi.fn(), error: vi.fn(), success: vi.fn(), encrypt: vi.fn()}));
vi.mock('@/util/ProjectUtil.ts', () => ({default: {cyclicBuildReleaseDependencies: mocks.build}}));
vi.mock('@/util/AuthFetchUtil.ts', () => ({default: {post: mocks.post}}));
vi.mock('@/util/HybridCryptoUtil.ts', () => ({HybridCryptoUtil: {encryptRequest: mocks.encrypt}}));
vi.mock('@/util/ProjectDataCodecUtil.ts', () => ({default: {compressIfBeneficial: (value: string) => value}}));
vi.mock('@/designer/header/DesignerHeaderStore.ts', () => ({default: {setCurrentKey: vi.fn()}}));
vi.mock('@datavisool/ui', () => ({
    Dialog: ({children}: any) => <div>{children}</div>,
    Button: ({children, onClick}: any) => <button onClick={onClick}>{children}</button>,
    Input: ({value, onChange, placeholder}: any) => <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />,
    Switch: ({value, onChange}: any) => <button onClick={() => onChange(!value)}>切换加密</button>,
    Select: () => null,
    NumberInput: () => null,
    globalMessage: {messageApi: {error: mocks.error, success: mocks.success}},
}));

import ReleaseHdConfigImpl from '@/designer/header/items/release/ReleaseHdConfigImpl.tsx';

describe('release dialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.DATAVISOOL_ENV = {projectId: '1', mainManger: {id: '1', name: 'main', getData: () => ({})}} as any;
    });
    afterEach(() => { cleanup(); delete (window as any).DATAVISOOL_ENV; });

    it('shows a reference error and does not send a release request', async () => {
        mocks.build.mockRejectedValue(new Error('引用的大屏不存在或无法读取：2'));
        render(<ReleaseHdConfigImpl />);
        fireEvent.click(screen.getByText('发布项目'));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('引用的大屏不存在或无法读取：2'));
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it('keeps the original password when an encrypted release needs to be retried', async () => {
        mocks.build.mockResolvedValue(undefined);
        mocks.encrypt.mockResolvedValue({ciphertext: 'test'});
        mocks.post.mockResolvedValueOnce(null).mockResolvedValueOnce('42');
        render(<ReleaseHdConfigImpl />);
        fireEvent.click(screen.getByText('切换加密'));
        fireEvent.change(screen.getByPlaceholderText('请输入访问密码'), {target: {value: 'secret'}});
        fireEvent.click(screen.getByText('发布项目'));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByText('发布项目'));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
        expect(mocks.encrypt).toHaveBeenNthCalledWith(1, 'secret');
        expect(mocks.encrypt).toHaveBeenNthCalledWith(2, 'secret');
        expect(await screen.findByText('查看发布')).toBeInTheDocument();
    });
});
