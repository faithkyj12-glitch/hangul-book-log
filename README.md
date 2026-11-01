# 우리집 책기록 — 설치 및 배포 안내

아이별로 한글책 표지를 촬영해 읽은 날짜와 제목을 기록하고, 일별·월별 독서량을 확인하는 모바일 우선 PWA입니다.

## 현재 포함된 기능
- 민아 / 윤아 독서 기록 분리
- 한글책 / 영어책 목록 및 통계 분리\n- 책별 선택형 5점 별점 평가
- 표지 촬영 또는 사진 선택
- 사진 크기 자동 축소 및 브라우저 내 저장(IndexedDB)
- 한국어 OCR 시도(Tesseract.js `kor+eng`) 후 제목 수정
- 날짜별 달력과 월간 권수 / 독서한 날 / 오늘 권수
- 기록 보기, 수정, 삭제
- JSON 백업
- 선택 사항인 Supabase 로그인·클라우드 동기화 연결 코드
- PWA manifest 및 서비스 워커

## 먼저 실행하기: 로컬 미리보기
PWA 카메라/서비스워커는 `file://` 주소에서 제한될 수 있으므로 로컬 웹 서버 또는 HTTPS 호스팅에서 실행하세요.

Python이 설치되어 있다면 프로젝트 폴더에서:
```bash
python -m http.server 8000
```
브라우저에서 `http://localhost:8000`으로 접속합니다. OCR과 Supabase JS는 CDN을 이용하므로 해당 기능에는 인터넷 연결이 필요합니다.

## 무료 HTTPS 배포 예시: GitHub Pages
1. GitHub에 새 저장소를 만듭니다.
2. 이 폴더의 파일을 저장소 최상위에 업로드합니다.
3. 저장소의 **Settings → Pages**에서 배포 소스를 설정합니다.
4. 제공된 HTTPS 주소를 휴대폰 Chrome에서 엽니다.
5. Chrome 메뉴에서 **홈 화면에 추가** 또는 **앱 설치**를 선택합니다.

정적 호스팅은 무료 플랜으로 시작할 수 있지만, 서비스 제공자의 정책과 사용량에 따라 조건이 달라질 수 있습니다.

## 로컬 저장 주의
클라우드 연결 전 기록은 현재 브라우저의 IndexedDB에 저장됩니다. 다른 기기에서는 자동으로 보이지 않으며, 브라우저 데이터 삭제/기기 분실 시 사라질 수 있습니다. 설정의 **기록 백업(JSON)** 을 주기적으로 이용하세요.

## Supabase 클라우드 동기화 설정
클라우드 동기화는 기본으로 켜져 있지 않습니다. 다음 절차를 완료해야 합니다.

### 1. 프로젝트 만들기
Supabase에서 프로젝트를 만들고 Project URL 및 publishable/anon 키를 준비합니다. 서비스 역할(service_role) 키는 절대 입력하거나 공개하지 마세요.

### 2. SQL Editor에서 아래 SQL 실행
```sql
create table if not exists public.book_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reader text not null check (reader in ('mina','yuna')),
  title text not null,
  read_date date not null,
  memo text not null default '',
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.book_records enable row level security;

create policy "Users can read their own book records"
on public.book_records for select to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own book records"
on public.book_records for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own book records"
on public.book_records for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own book records"
on public.book_records for delete to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-covers', 'book-covers', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "Users can view their own book covers"
on storage.objects for select to authenticated
using (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload their own book covers"
on storage.objects for insert to authenticated
with check (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own book covers"
on storage.objects for update to authenticated
using (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own book covers"
on storage.objects for delete to authenticated
using (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);
```

### 기존 Supabase 프로젝트를 이미 만들었다면: 언어 구분 열 추가
기존 테이블에 아래 SQL을 한 번 실행하세요.
```sql
alter table public.book_records
add column if not exists language text not null default 'ko'
check (language in ('ko','en'));
```
기존 기록은 자동으로 `ko`(한글책)로 분류됩니다.

### 별점 기능을 클라우드 동기화에도 저장하려면
기존 Supabase 테이블에 아래 SQL을 한 번 실행하세요.
```sql
alter table public.book_records
add column if not exists rating smallint
check (rating between 1 and 5 or rating is null);
```
별점을 선택하지 않은 기록은 `null`로 저장됩니다. 로컬 저장만 사용하는 경우 SQL 실행은 필요하지 않습니다.

### 3. 앱에서 연결
1. 앱 오른쪽 위 ⚙ 설정을 엽니다.
2. Project URL과 publishable/anon 키를 입력합니다.
3. **연결 확인**을 누릅니다.
4. 로그인 이메일을 입력하고 **로그인 링크 받기**를 누릅니다.
5. 이메일의 로그인 링크를 같은 기기 브라우저에서 엽니다.
6. 로그인 상태가 된 후 기록을 추가하면 클라우드 동기화를 시도합니다.

Supabase **Authentication → URL Configuration**에서 앱의 실제 HTTPS 주소를 Site URL / Redirect URLs에 허용해야 이메일 로그인 링크가 정상 작동합니다.

### 중요: 초기 버전의 동기화 동작
이 버전은 로그인한 기기의 로컬 기록을 클라우드로 업로드하고 클라우드 기록을 내려받는 기본 흐름을 포함합니다. 처음 클라우드 연결 시 동일한 ID의 충돌, 여러 기기에서 동시에 수정, 사진 업로드 실패 시 재시도 등은 완전한 양방향 충돌 해결 기능이 아닙니다. 본격적으로 사용하기 전 테스트 기록으로 확인하세요. 로컬 데이터와 클라우드 데이터를 합칠 때는 먼저 JSON 백업을 권장합니다.

## OCR 관련 안내
표지의 디자인, 글자 크기, 반사광 등에 따라 한국어 OCR 결과가 틀릴 수 있습니다. 자동 인식된 제목을 반드시 확인하고 필요하면 직접 수정하세요. 최초 OCR 실행 시 한국어 언어 데이터 다운로드로 시간이 걸릴 수 있습니다.

## 개인정보
표지 사진에는 책 제목 외 다른 정보가 찍히지 않도록 주의하세요. 앱의 클라우드 연결 시 사진은 비공개 Storage 버킷에 저장되며 로그인 사용자 소유 경로 정책을 사용합니다. 개인 또는 자녀 기록을 실제로 저장하기 전 Supabase 정책과 인증 설정을 직접 확인하세요.
