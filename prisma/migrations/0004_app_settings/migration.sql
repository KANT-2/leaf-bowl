-- 기본 데이터 중 배너·운영시간·영양정보·가격 정책은 SQL로 초기화한다.
CREATE TABLE app_settings (
  key VARCHAR(80) PRIMARY KEY CHECK (key ~ '^[a-z_]+$'),
  value JSONB NOT NULL CHECK (jsonb_typeof(value) IN ('object', 'array')),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
