import type { AppProps } from 'next/app'
export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <style jsx global>{`
        html { overflow-y: scroll; scrollbar-gutter: stable; }
      `}</style>
      <Component {...pageProps} />
    </>
  )
}
