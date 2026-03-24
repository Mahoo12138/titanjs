import { describe, it, expect } from "vitest";
import { defineConfig } from "../src/config.js";

describe("Config", () => {
  it("defineConfig should pass-through config object", () => {
    const config = defineConfig({ title: "Test" });
    expect(config.title).toBe("Test");
  });

  it("defineConfig preserves all properties", () => {
    const config = defineConfig({
      title: "My Site",
      url: "https://example.com",
      build: {
        outDir: "dist",
        concurrency: 16,
        cacheDir: "",
      },
    });

    expect(config.title).toBe("My Site");
    expect(config.url).toBe("https://example.com");
    expect(config.build?.outDir).toBe("dist");
    expect(config.build?.concurrency).toBe(16);
  });

  it("defineConfig works with empty config", () => {
    const config = defineConfig({});
    expect(config).toEqual({});
  });

  it("defineConfig works with plugins", () => {
    const config = defineConfig({
      plugins: [{ name: "test-plugin", hooks: {} }],
    });
    expect(config.plugins).toHaveLength(1);
    expect(config.plugins![0].name).toBe("test-plugin");
  });
});
