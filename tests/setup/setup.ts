// Vitest 用の入口。expect に jest-dom の matcher（toBeInTheDocument など）を足し、型も Vitest の Assertion に足す。
// 以前の '@testing-library/jest-dom' は Jest の型にしか足さないので、tsc が matcher を知らなかった
import '@testing-library/jest-dom/vitest'
