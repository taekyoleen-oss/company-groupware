This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Vercel 배포

1. GitHub 저장소([taekyoleen-oss/company-groupware](https://github.com/taekyoleen-oss/company-groupware))를 [Vercel](https://vercel.com/new)에 연결합니다.
2. **Environment Variables**에 `.env.example`에 나온 변수를 입력합니다. 프로덕션 도메인이 정해지면 `NEXT_PUBLIC_APP_URL`을 `https://<프로젝트>.vercel.app` 또는 커스텀 도메인으로 맞춥니다.
3. Supabase 대시보드 **Authentication → URL Configuration**에서 Site URL과 Redirect URLs에 동일한 프로덕션 주소를 추가하고, OAuth 제공자 리다이렉트 URI에 `https://<배포주소>/api/auth/callback` 형태가 포함되는지 확인합니다.

로컬에서는 `pnpm install` 후 `pnpm run build`로 프로덕션 빌드를 미리 검증할 수 있습니다.

자세한 내용은 [Next.js 배포 문서](https://nextjs.org/docs/app/building-your-application/deploying)를 참고하세요.
