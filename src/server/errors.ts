export class ApiFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export const unauthenticated = () => new ApiFailure(401, "UNAUTHENTICATED", "Cần đăng nhập lại.");
export const forbidden = () => new ApiFailure(403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.");
export const notFound = () => new ApiFailure(404, "NOT_FOUND", "Không tìm thấy dữ liệu.");
export const conflict = (message: string) => new ApiFailure(409, "STATE_CONFLICT", message);
export const invalid = (message: string) => new ApiFailure(422, "INVALID_INPUT", message);
export const unavailable = () => new ApiFailure(503, "SERVICE_UNAVAILABLE", "Dịch vụ tạm thời chưa sẵn sàng.");
