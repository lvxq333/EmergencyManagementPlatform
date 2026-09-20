package com.risk.platform.auth;

public record RegisterRequest(String username, String password, String realName) {
}
