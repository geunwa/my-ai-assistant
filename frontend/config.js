// API 서버 주소 설정.
// Vercel 배포 때는 build.sh가 Vercel 환경 변수 API_BASE_URL로 이 파일을 새로 만든다.
// 이 파일은 내 PC에서 열 때, 그리고 환경 변수가 없을 때 쓰는 기본값이다(Render 서버).
// 내 PC의 백엔드로 시험하려면 아래 주소를 "http://127.0.0.1:8000" 으로 바꾼다.
window.APP_CONFIG = {
  API_BASE_URL: "https://my-ai-assistant-pjlv.onrender.com",
};
