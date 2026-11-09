/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.zsq.datavisoolservice.model.po.RemoteComponentDocumentPO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface RemoteComponentDocumentMapper extends BaseMapper<RemoteComponentDocumentPO> {
    @Select("select * from remote_component_document where deleted = 1")
    List<RemoteComponentDocumentPO> deletedDocuments();
}
