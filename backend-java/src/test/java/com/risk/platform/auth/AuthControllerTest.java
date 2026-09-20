package com.risk.platform.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthController.class)
class AuthControllerTest {
    @Autowired
    MockMvc mockMvc;

    @MockBean
    AuthService authService;

    @Test
    void loginReturnsTokenAndCompatibleUserShape() throws Exception {
        when(authService.login(any())).thenReturn(new LoginResponse(
                "登录成功",
                "jwt-token",
                new LoginUserResponse(1L, "admin", "管理员", List.of("Administrator"))
        ));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"123456\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("登录成功"))
                .andExpect(jsonPath("$.token").value("jwt-token"))
                .andExpect(jsonPath("$.user.realName").value("管理员"))
                .andExpect(jsonPath("$.user.roleNames[0]").value("Administrator"));
    }

    @Test
    void registerReturnsCreatedUserId() throws Exception {
        when(authService.register(any())).thenReturn(new RegisterResponse("注册成功", 3L));

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"viewer01\",\"password\":\"123456\",\"realName\":\"查看员\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.message").value("注册成功"))
                .andExpect(jsonPath("$.userId").value(3));
    }
}
