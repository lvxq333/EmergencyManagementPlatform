package com.risk.platform.auth;

public record LoginResponse(String message, String token, LoginUserResponse user) {
}
