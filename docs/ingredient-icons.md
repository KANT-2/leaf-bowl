# 내 취향 찾기 재료 아이콘

이슈 #17의 재료 아이콘은 ChatGPT 내장 이미지 생성 도구(`image_gen`)로 각 재료 사진을 개별 참고하여 생성했다. 카드에 사용하는 원본 사진은 유지하고, 생성 결과는 투명도를 유지한 96 × 96 WebP(quality 90, alphaQuality 100)로 내보냈다.

- 참고 사진: `public/images/ingredients/{id}.png`
- 웹용 아이콘: `public/images/ingredient-icons/{id}.webp`
- 표시 컴포넌트: `components/IngredientIcon.tsx`
- 사용 위치: `/match`의 그릇 미리보기, 선택 재료 목록, 완성 창

아이콘은 이미 작은 웹용 파일이므로 Next.js의 추가 이미지 변환 없이 제공한다. 재료명과 함께 표시하는 이미지는 빈 대체 텍스트를 사용하며, 장식용 그릇 미리보기는 접근성 트리에서 숨긴다. 새 재료를 추가할 때는 같은 ID의 아이콘도 추가한다.

## 생성 프롬프트

각 사진을 `referenced_image_paths`로 지정하고 `transparent_background: true`로 생성했다. 아래 템플릿의 `SUBJECT`는 표의 해당 항목으로 치환한다.

```text
Use case: stylized-concept.
Asset type: individual salad ingredient UI icon, clearly recognizable at 24 to 36 CSS pixels.
Primary request: Create a photo-informed miniature food illustration of SUBJECT. Use the attached existing ingredient photograph solely as reference for identity, preparation, colors and textures; simplify the composition into a compact small icon.
Style: realistic miniature food with gently simplified forms, natural saturated food colors, subtle soft 3D volume, clean silhouette and appetizing realistic details. Consistent three-quarter overhead view, soft light from upper left.
Composition: one centered compact ingredient grouping in a square, entire subject visible, filling about 80% of canvas, even transparent margins.
Backdrop: truly transparent alpha background.
Constraints: only the specified food, no bowls, no plates, no garnish, no utensils, no faces, no text, no border, no sticker outline, no watermark, no background shadow, no checkerboard drawn into the artwork.
```

| ID | SUBJECT |
| --- | --- |
| romaine | two crisp light-green elongated romaine leaves with prominent pale ribs |
| kale | two dark-green curly kale leaves with deeply ruffled edges |
| chicken | three slices of golden grilled chicken breast, white meat and brown grill marks, no bone |
| salmon | one small orange roasted salmon fillet with browned top and visible flaky flesh |
| shrimp | two peeled cooked shrimp, curled pink-orange bodies with tails, no batter |
| tofu | three golden pan-seared tofu cubes with creamy white sides |
| chickpea | a compact cluster of six beige cooked chickpeas |
| avocado | one avocado half with brown pit and one pale green avocado slice |
| tomato | two red cherry tomatoes, one whole and one cut half |
| cucumber | three fresh round cucumber slices with dark green skin and pale seeded centers |
| mango | three golden-yellow mango cubes and one ripe mango slice |
| corn | a compact cluster of eight glossy yellow sweetcorn kernels, no cob |
| mushroom | two sliced brown roasted button mushrooms showing gills |
| burrata | one white burrata cheese pouch with a softly opened creamy center, no plate |
| quinoa | a compact little mound of tiny beige cooked quinoa grains showing germ spirals, no wheat stalk |
| crouton | three crunchy golden toasted bread cubes with browned edges |
| nuts | a compact cluster of almond, walnut half and peanut, natural brown tones |
| olive | two shiny black olives and two sliced black olive rings |
