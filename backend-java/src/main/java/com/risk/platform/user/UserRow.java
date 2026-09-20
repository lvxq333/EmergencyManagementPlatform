package com.risk.platform.user;

public record UserRow(
        Long id,
        String username,
        String passwordHash,
        String realName,
        String email,
        String phone,
        boolean active
) {
}
