package com.risk.platform.role;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(RoleController.class)
class RoleControllerTest {
    @Autowired
    MockMvc mockMvc;

    @MockBean
    RoleService roleService;

    @Test
    void listRolesReturnsSnakeCaseRoleNameAndPermissionIds() throws Exception {
        when(roleService.listRoles()).thenReturn(List.of(new RoleResponse(
                1L,
                "Administrator",
                "超级管理员",
                LocalDateTime.of(2026, 6, 22, 10, 0),
                List.of(1L, 2L)
        )));

        mockMvc.perform(get("/api/roles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].role_name").value("Administrator"))
                .andExpect(jsonPath("$[0].permissionIds[0]").value(1));
    }

    @Test
    void listPermissionsReturnsSnakeCaseFields() throws Exception {
        when(roleService.listPermissions()).thenReturn(List.of(new PermissionResponse(
                1L,
                "user:manage",
                "用户管理菜单",
                "System"
        )));

        mockMvc.perform(get("/api/permissions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].permission_key").value("user:manage"))
                .andExpect(jsonPath("$[0].permission_name").value("用户管理菜单"));
    }
}
