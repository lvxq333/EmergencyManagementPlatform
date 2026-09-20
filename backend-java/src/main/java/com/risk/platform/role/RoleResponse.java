package com.risk.platform.role;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;
import java.util.List;

public record RoleResponse(
        Long id,
        @JsonProperty("role_name") String roleName,
        String description,
        @JsonProperty("created_at") LocalDateTime createdAt,
        List<Long> permissionIds
) {
}
