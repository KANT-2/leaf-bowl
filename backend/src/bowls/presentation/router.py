"""로그인한 회원의 조합 저장·조회·삭제 API."""

from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from bowls.application.service import BowlRecipeService
from bowls.presentation.dependencies import get_bowl_recipe_service
from bowls.presentation.schemas import BowlRecipeListResponse, BowlRecipeResponse, CreateBowlRequest
from core.dependencies import CurrentCustomer, get_current_customer

router = APIRouter(prefix="/api/v1/bowls", tags=["bowls"])
ERROR_401 = {401: {"description": "로그인 필요, 토큰 만료·위조·로그아웃"}}


@router.post(
    "",
    response_model=BowlRecipeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="내 조합 저장",
    description="회원 번호·가격은 서버에서 결정한다. 최대 20개이며 초과 시 가장 오래된 조합을 정리한다.",
    responses={400: {"description": "중복 재료·품절·선택할 수 없는 재료나 드레싱"}, **ERROR_401},
)
async def save_recipe(
    body: CreateBowlRequest,
    customer: CurrentCustomer = Depends(get_current_customer),
    service: BowlRecipeService = Depends(get_bowl_recipe_service),
):
    return await service.save(customer.id, body.to_domain())


@router.get("", response_model=BowlRecipeListResponse, summary="내 조합 목록", responses=ERROR_401)
async def list_recipes(
    customer: CurrentCustomer = Depends(get_current_customer),
    service: BowlRecipeService = Depends(get_bowl_recipe_service),
):
    recipes = await service.list_mine(customer.id)
    return BowlRecipeListResponse(
        items=[BowlRecipeResponse.model_validate(recipe) for recipe in recipes],
        total=len(recipes),
    )


@router.delete(
    "/{recipe_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="내 조합 삭제",
    responses={404: {"description": "없는 조합 또는 다른 회원의 조합"}, **ERROR_401},
)
async def delete_recipe(
    recipe_id: UUID,
    customer: CurrentCustomer = Depends(get_current_customer),
    service: BowlRecipeService = Depends(get_bowl_recipe_service),
) -> Response:
    await service.delete_mine(customer.id, recipe_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
