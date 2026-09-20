package com.risk.platform.role;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record RoleRequest(
        @JsonProperty("role_name") String roleName,
        String description,
        List<Long> permissionIds
) {
}
