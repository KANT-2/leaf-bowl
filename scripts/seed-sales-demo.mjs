import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve(process.env.ADMIN_DATA_DIR || '.data/admin');
const sample = JSON.parse(await readFile(new URL('../fixtures/admin/sales-orders.demo.json', import.meta.url), 'utf8'));
if (sample.demo !== true || !sample.orders.every(order => order.id.startsWith('DEMO-'))) {
  throw new Error('가상 주문 파일을 확인해주세요.');
}
await mkdir(directory, { recursive: true });
try {
  await writeFile(path.join(directory, 'sales-orders.json'), JSON.stringify(sample, null, 2) + '\n', { flag: 'wx' });
  console.log(`가상 주문 ${sample.orders.length}건 적용 완료: ${directory}`);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.error('기존 판매 데이터가 있어 중단했습니다. 기존 파일을 별도로 보관한 뒤 실행해주세요.');
  process.exitCode = 1;
}
