package com.risk.platform.auth;

import java.util.List;

public record LoginUserResponse(Long id, String username, String realName, List<String> roleNames) {
}
