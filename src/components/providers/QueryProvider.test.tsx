import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "./QueryProvider";

function TestConsumer() {
  const queryClient = useQueryClient();
  return (
    <div>
      {queryClient ? "QueryClient 可用" : "QueryClient 不可用"}
    </div>
  );
}

describe("QueryProvider", () => {
  it("provides QueryClient to children", () => {
    render(
      <QueryProvider>
        <TestConsumer />
      </QueryProvider>
    );
    expect(screen.getByText("QueryClient 可用")).toBeInTheDocument();
  });

  it("renders children correctly", () => {
    render(
      <QueryProvider>
        <div>子组件内容</div>
      </QueryProvider>
    );
    expect(screen.getByText("子组件内容")).toBeInTheDocument();
  });
});
