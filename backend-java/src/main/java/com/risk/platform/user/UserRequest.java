package com.risk.platform.user;

import java.util.List;

public record UserRequest(String username, String password, String realName, List<Long> roleIds) {
}
