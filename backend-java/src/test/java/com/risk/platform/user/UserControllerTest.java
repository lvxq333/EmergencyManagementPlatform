package com.risk.platform.user;

import com.risk.platform.common.MessageResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(UserController.class)
class UserControllerTest {
    @Autowired
    MockMvc mockMvc;

    @MockBean
    UserService userService;

    @Test
    void listUsersReturnsFrontendFields() throws Exception {
        when(userService.listUsers("管理员")).thenReturn(List.of(new UserResponse(
                1L, "admin", "管理员", "admin@example.com", "13800000000", "active", List.of(1L)
        )));

        mockMvc.perform(get("/api/users").param("search", "管理员"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].realName").value("管理员"))
                .andExpect(jsonPath("$[0].status").value("active"))
                .andExpect(jsonPath("$[0].roleIds[0]").value(1));
    }

    @Test
    void createUserReturnsId() throws Exception {
        when(userService.createUser(any())).thenReturn(Map.of("message", "用户创建成功", "id", 4L));

        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"u\",\"password\":\"p\",\"realName\":\"用户\",\"roleIds\":[1]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.message").value("用户创建成功"))
                .andExpect(jsonPath("$.id").value(4));
    }

    @Test
    void updateStatusReturnsMessage() throws Exception {
        when(userService.updateStatus(eq(1L), any())).thenReturn(new MessageResponse("状态已更新"));

        mockMvc.perform(patch("/api/users/1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"inactive\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("状态已更新"));
    }
}
