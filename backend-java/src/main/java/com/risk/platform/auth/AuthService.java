package com.risk.platform.auth;

import com.risk.platform.common.ApiException;
import com.risk.platform.user.UserRepository;
import com.risk.platform.user.UserRow;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public LoginResponse login(LoginRequest request) {
        UserRow user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "用户名或密码错误"));
        if (!passwordEncoder.matches(request.password(), user.passwordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "用户名或密码错误");
        }
        List<String> roleNames = userRepository.findRoleNames(user.id());
        String token = jwtService.createToken(user.id(), user.username());
        return new LoginResponse(
                "登录成功",
                token,
                new LoginUserResponse(user.id(), user.username(), user.realName(), roleNames)
        );
    }

    public RegisterResponse register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.username())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "用户名已存在");
        }
        String passwordHash = passwordEncoder.encode(request.password());
        Long userId = userRepository.createUser(request.username(), passwordHash, request.realName(), List.of());
        return new RegisterResponse("注册成功", userId);
    }
}
