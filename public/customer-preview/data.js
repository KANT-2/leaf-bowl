const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PRODUCTS=PREVIEW_CATALOG.products.filter(p=>p.type!=='dressing'&&!p.deleted&&p.status!=='hidden').map((p,id)=>({...p,id,sourceId:p.id,name:esc(p.name),en:'',desc:esc(p.description),ingredients:esc(p.description),tag:p.status==='soldout'?'품절':p.badge,category:p.category,allergens:p.allergens?[esc(p.allergens)]:[]}));
const DRESSINGS=[{name:'선택 옵션',allergens:[]}];const DRINKS=[];
function money(v){return v.toLocaleString('ko-KR')+'원'}
function photo(id,cls=''){const p=PRODUCTS[id];return p.image?`<img class="food-image ${cls}" src="${esc(p.image)}" alt="${p.name}" loading="lazy">`:''}

// 이 페이지의 다음 script가 사용하는 공통 값과 표시 함수.
Object.assign(window, { DRESSINGS, DRINKS, money, photo });
