package com.risk.platform.role;

import com.fasterxml.jackson.annotation.JsonProperty;

public record PermissionResponse(
        Long id,
        @JsonProperty("permission_key") String permissionKey,
        @JsonProperty("permission_name") String permissionName,
        String module
) {
}
