from fastapi import APIRouter, BackgroundTasks, Depends, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm

from auth.application.service import LOGIN_FAILED, AuthService, SignupCommand
from auth.presentation.dependencies import customer_oauth2, get_auth_service
from auth.presentation.login_history import LoginRecorder, get_login_recorder
from auth.presentation.schemas import SignupRequest, TokenResponse
from core.exception_handlers import error_body
from core.exceptions import Unauthorized
from customers.presentation.schemas import CustomerResponse

router = APIRouter(prefix="/api", tags=["auth"])

ERROR_401 = {401: {"description": "토큰 없음·만료·위조, 로그아웃한 토큰"}}


@router.post(
    "/auth/signup",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="회원가입",
    responses={400: {"description": "비밀번호·이름·전화번호 규칙 위반"}, 409: {"description": "이미 가입된 이메일"}},
)
async def signup(body: SignupRequest, service: AuthService = Depends(get_auth_service)):
    customer = await service.signup(SignupCommand(body.email, body.password, body.name, body.phone))
    return CustomerResponse.of(customer)


@router.post(
    "/auth/token",
    response_model=TokenResponse,
    summary="로그인 (OAuth2 password flow)",
    description="form 의 username 칸에 이메일을 넣는다. Swagger 오른쪽 위 Authorize 로도 로그인할 수 있다.",
    responses={401: {"description": "이메일 또는 비밀번호 불일치"}},
)
async def login(
    request: Request,
    background: BackgroundTasks,
    form: OAuth2PasswordRequestForm = Depends(),
    service: AuthService = Depends(get_auth_service),
    record_login: LoginRecorder = Depends(get_login_recorder),
):
    outcome = await service.attempt_login(form.username, form.password, request.headers.get("user-agent"))
    if outcome.attempt:
        # 이력 저장은 응답을 보낸 뒤에 한다 (로그인 응답 속도에 영향 없음)
        background.add_task(record_login, outcome.attempt)
    if outcome.token is None:
        # 예외를 던지면 BackgroundTasks 가 실행되지 않으므로, 실패 응답을 직접 만들어 돌려준다
        return JSONResponse(
            error_body(Unauthorized.code, LOGIN_FAILED),
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenResponse(access_token=outcome.token.token, expires_in=outcome.token.expires_in)


@router.post(
    "/auth/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="로그아웃 (토큰 블랙리스트 등록)",
    description="이후 같은 토큰으로 보호된 API 를 호출하면 401 이 된다.",
    responses=ERROR_401,
)
async def logout(token: str = Depends(customer_oauth2), service: AuthService = Depends(get_auth_service)):
    await service.logout(token)
