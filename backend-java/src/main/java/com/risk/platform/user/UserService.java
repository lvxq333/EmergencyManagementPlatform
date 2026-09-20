package com.risk.platform.user;

import com.risk.platform.common.MessageResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<UserResponse> listUsers(String search) {
        return userRepository.listUsers(search).stream().map(user -> new UserResponse(
                user.id(),
                user.username(),
                user.realName(),
                user.email(),
                user.phone(),
                user.active() ? "active" : "inactive",
                userRepository.findRoleIds(user.id())
        )).toList();
    }

    public Object createUser(UserRequest request) {
        String passwordHash = passwordEncoder.encode(request.password());
        Long id = userRepository.createUser(request.username(), passwordHash, request.realName(), safeRoles(request.roleIds()));
        return java.util.Map.of("message", "用户创建成功", "id", id);
    }

    public MessageResponse updateUser(Long id, UserRequest request) {
        String passwordHash = request.password() == null || request.password().isBlank()
                ? null
                : passwordEncoder.encode(request.password());
        userRepository.updateUser(id, request.username(), request.realName(), passwordHash, safeRoles(request.roleIds()));
        return new MessageResponse("用户更新成功");
    }

    public MessageResponse deleteUser(Long id) {
        userRepository.deleteUser(id);
        return new MessageResponse("用户已删除");
    }

    public MessageResponse updateStatus(Long id, UserStatusRequest request) {
        userRepository.updateStatus(id, "active".equals(request.status()));
        return new MessageResponse("状态已更新");
    }

    private List<Long> safeRoles(List<Long> roleIds) {
        return roleIds == null ? List.of() : roleIds;
    }
}
