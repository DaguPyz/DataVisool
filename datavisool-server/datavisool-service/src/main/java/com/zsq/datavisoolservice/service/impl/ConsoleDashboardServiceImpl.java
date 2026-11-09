/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.zsq.datavisoolservice.mapper.DynamicScriptMapper;
import com.zsq.datavisoolservice.mapper.FontMapper;
import com.zsq.datavisoolservice.mapper.ProjectMapper;
import com.zsq.datavisoolservice.mapper.ProjectReleaseMapper;
import com.zsq.datavisoolservice.mapper.ThreeDModelMapper;
import com.zsq.datavisoolservice.mapper.VideoMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ConsoleDashboardDTO;
import com.zsq.datavisoolservice.model.dto.ConsoleRecentActivityDTO;
import com.zsq.datavisoolservice.model.po.DynamicScriptPO;
import com.zsq.datavisoolservice.model.po.FontPO;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import com.zsq.datavisoolservice.model.po.ProjectReleasePO;
import com.zsq.datavisoolservice.model.po.ThreeDModelPO;
import com.zsq.datavisoolservice.model.po.VideoPO;
import com.zsq.datavisoolservice.service.ConsoleDashboardService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ConsoleDashboardServiceImpl implements ConsoleDashboardService {

    private static final int RECENT_ITEM_LIMIT = 5;

    private final ProjectMapper projectMapper;
    private final FontMapper fontMapper;
    private final VideoMapper videoMapper;
    private final ThreeDModelMapper threeDModelMapper;
    private final DynamicScriptMapper dynamicScriptMapper;
    private final ProjectReleaseMapper projectReleaseMapper;

    @Override
    public ConsoleDashboardDTO getDashboard() {
        ConsoleDashboardDTO dto = new ConsoleDashboardDTO();
        User user = AppContextUtil.getCurrentUser();
        if (user == null || user.getId() == null)
            return dto;

        Long userId = user.getId();
        LocalDateTime activeSince = LocalDateTime.now().minusHours(24);

        dto.setProjectCount(defaultCount(projectMapper.selectCount(projectCountWrapper(userId))));
        dto.setFontCount(defaultCount(fontMapper.selectCount(byUserWrapper(FontPO::getUserId, userId))));
        dto.setVideoCount(defaultCount(videoMapper.selectCount(byUserWrapper(VideoPO::getUserId, userId))));
        dto.setModelCount(defaultCount(threeDModelMapper.selectCount(byUserWrapper(ThreeDModelPO::getUserId, userId))));
        dto.setDynamicScriptCount(defaultCount(dynamicScriptMapper.selectCount(byUserWrapper(DynamicScriptPO::getUserId, userId))));
        dto.setReleaseCount(defaultCount(projectReleaseMapper.selectCount(byUserWrapper(ProjectReleasePO::getUserId, userId))));
        dto.setActiveProjectCount(defaultCount(projectMapper.selectCount(activeProjectWrapper(userId, activeSince))));
        dto.setRecentActivities(loadRecentActivities(userId));
        return dto;
    }

    private List<ConsoleRecentActivityDTO> loadRecentActivities(Long userId) {
        List<ConsoleRecentActivityDTO> activities = new ArrayList<>();
        activities.addAll(loadRecentProjects(userId));
        activities.addAll(loadRecentFonts(userId));
        activities.addAll(loadRecentVideos(userId));
        activities.addAll(loadRecentModels(userId));
        activities.sort(Comparator.comparingLong(ConsoleRecentActivityDTO::getTimeMs).reversed());
        if (activities.size() <= RECENT_ITEM_LIMIT)
            return activities;
        return new ArrayList<>(activities.subList(0, RECENT_ITEM_LIMIT));
    }

    private List<ConsoleRecentActivityDTO> loadRecentProjects(Long userId) {
        LambdaQueryWrapper<ProjectPO> wrapper = projectRecentWrapper(userId);
        List<ProjectPO> items = projectMapper.selectList(wrapper);
        List<ConsoleRecentActivityDTO> result = new ArrayList<>(items.size());
        for (ProjectPO item : items) {
            result.add(toRecentActivity("project", item.getId(), item.getName(), item.getUpdateTime(), item.getCreateTime()));
        }
        return result;
    }

    private List<ConsoleRecentActivityDTO> loadRecentFonts(Long userId) {
        LambdaQueryWrapper<FontPO> wrapper = new LambdaQueryWrapper<FontPO>()
                .select(FontPO::getId, FontPO::getName, FontPO::getCreateTime, FontPO::getUpdateTime)
                .eq(FontPO::getUserId, userId)
                .orderByDesc(FontPO::getUpdateTime, FontPO::getCreateTime)
                .last("limit " + RECENT_ITEM_LIMIT);
        List<FontPO> items = fontMapper.selectList(wrapper);
        List<ConsoleRecentActivityDTO> result = new ArrayList<>(items.size());
        for (FontPO item : items) {
            result.add(toRecentActivity("font", item.getId(), item.getName(), item.getUpdateTime(), item.getCreateTime()));
        }
        return result;
    }

    private List<ConsoleRecentActivityDTO> loadRecentVideos(Long userId) {
        LambdaQueryWrapper<VideoPO> wrapper = new LambdaQueryWrapper<VideoPO>()
                .select(VideoPO::getId, VideoPO::getName, VideoPO::getCreateTime, VideoPO::getUpdateTime)
                .eq(VideoPO::getUserId, userId)
                .orderByDesc(VideoPO::getUpdateTime, VideoPO::getCreateTime)
                .last("limit " + RECENT_ITEM_LIMIT);
        List<VideoPO> items = videoMapper.selectList(wrapper);
        List<ConsoleRecentActivityDTO> result = new ArrayList<>(items.size());
        for (VideoPO item : items) {
            result.add(toRecentActivity("video", item.getId(), item.getName(), item.getUpdateTime(), item.getCreateTime()));
        }
        return result;
    }

    private List<ConsoleRecentActivityDTO> loadRecentModels(Long userId) {
        LambdaQueryWrapper<ThreeDModelPO> wrapper = new LambdaQueryWrapper<ThreeDModelPO>()
                .select(ThreeDModelPO::getId, ThreeDModelPO::getName, ThreeDModelPO::getCreateTime, ThreeDModelPO::getUpdateTime)
                .eq(ThreeDModelPO::getUserId, userId)
                .orderByDesc(ThreeDModelPO::getUpdateTime, ThreeDModelPO::getCreateTime)
                .last("limit " + RECENT_ITEM_LIMIT);
        List<ThreeDModelPO> items = threeDModelMapper.selectList(wrapper);
        List<ConsoleRecentActivityDTO> result = new ArrayList<>(items.size());
        for (ThreeDModelPO item : items) {
            result.add(toRecentActivity("model", item.getId(), item.getName(), item.getUpdateTime(), item.getCreateTime()));
        }
        return result;
    }

    private LambdaQueryWrapper<ProjectPO> projectCountWrapper(Long userId) {
        return new LambdaQueryWrapper<ProjectPO>()
                .eq(ProjectPO::getUserId, userId)
                .isNull(ProjectPO::getPid);
    }

    private LambdaQueryWrapper<ProjectPO> activeProjectWrapper(Long userId, LocalDateTime activeSince) {
        return new LambdaQueryWrapper<ProjectPO>()
                .eq(ProjectPO::getUserId, userId)
                .isNull(ProjectPO::getPid)
                .and(wrapper -> wrapper.ge(ProjectPO::getUpdateTime, activeSince)
                        .or()
                        .ge(ProjectPO::getCreateTime, activeSince));
    }

    private LambdaQueryWrapper<ProjectPO> projectRecentWrapper(Long userId) {
        return new LambdaQueryWrapper<ProjectPO>()
                .select(ProjectPO::getId, ProjectPO::getName, ProjectPO::getCreateTime, ProjectPO::getUpdateTime)
                .eq(ProjectPO::getUserId, userId)
                .isNull(ProjectPO::getPid)
                .orderByDesc(ProjectPO::getUpdateTime, ProjectPO::getCreateTime)
                .last("limit " + RECENT_ITEM_LIMIT);
    }

    private <T> LambdaQueryWrapper<T> byUserWrapper(com.baomidou.mybatisplus.core.toolkit.support.SFunction<T, ?> userColumn,
                                                    Long userId) {
        return new LambdaQueryWrapper<T>().eq(userColumn, userId);
    }

    private Long defaultCount(Long value) {
        return value == null ? 0L : value;
    }

    private ConsoleRecentActivityDTO toRecentActivity(String type,
                                                      Long id,
                                                      String name,
                                                      LocalDateTime updateTime,
                                                      LocalDateTime createTime) {
        ConsoleRecentActivityDTO dto = new ConsoleRecentActivityDTO();
        dto.setId(id == null ? "" : id.toString());
        dto.setType(type);
        dto.setName(name == null ? "" : name);
        dto.setTimeMs(resolveTimeMs(updateTime, createTime));
        return dto;
    }

    private Long resolveTimeMs(LocalDateTime updateTime, LocalDateTime createTime) {
        LocalDateTime source = updateTime != null ? updateTime : createTime;
        if (source == null)
            return 0L;
        return source.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }
}
