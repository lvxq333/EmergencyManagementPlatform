package com.risk.platform.user;

import java.util.List;

public record UserResponse(
        Long id,
        String username,
        String realName,
        String email,
        String phone,
        String status,
        List<Long> roleIds
) {
}
