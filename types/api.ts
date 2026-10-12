// API 에러 응답 형식. 모든 API 가 실패하면 이 모양으로 응답한다.
export interface ApiError {
  message: string;
}
