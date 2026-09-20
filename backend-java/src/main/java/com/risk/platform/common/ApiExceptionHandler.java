package com.risk.platform.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    private final boolean exposeInternalErrors;

    public ApiExceptionHandler(@Value("${risk-platform.expose-internal-errors:false}") boolean exposeInternalErrors) {
        this.exposeInternalErrors = exposeInternalErrors;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<MessageResponse> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.status()).body(new MessageResponse(ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<MessageResponse> handleValidation(MethodArgumentNotValidException ex) {
        return ResponseEntity.badRequest().body(new MessageResponse("请求参数错误"));
    }

    @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    public ResponseEntity<MessageResponse> handleMalformedRequest(Exception ex) {
        return ResponseEntity.badRequest().body(new MessageResponse("请求格式错误，请检查数字、布尔值和带时区的时间格式"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<MessageResponse> handleException(Exception ex) {
        log.error("Unhandled API exception", ex);
        String message = exposeInternalErrors && ex.getMessage() != null
            ? ex.getMessage()
            : "服务器内部错误";
        return ResponseEntity.internalServerError().body(new MessageResponse(message));
    }
}
