// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MapEmbed from "./MapEmbed";

afterEach(cleanup);
describe("resolved destination map", () => {
  it("embeds the supplied coordinate pair with a descriptive frame name", () => {
    render(<MapEmbed query="Cafe" name="Cafe East" lat={45} lng={-122} />);
    const frame = screen.getByTitle("Google map of Cafe East");
    expect(frame.getAttribute("src")).toContain("q=45,-122");
  });
  it("uses the exact place ID link when coordinates are incomplete", () => {
    render(<MapEmbed query="Cafe" name="Cafe East" placeId="east-branch" address="17 Example St" lat={45} />);
    expect(screen.queryByTitle(/Google map/)).toBeNull();
    expect(screen.getByText(/Map location unknown/)).toBeDefined();
    const href = new URL(screen.getByRole("link").getAttribute("href")!);
    expect(href.searchParams.get("query_place_id")).toBe("east-branch");
    expect(href.searchParams.get("query")).toBe("Cafe East, 17 Example St");
  });
  it("does not re-geocode an ambiguous name when exact identity is unavailable", () => {
    render(<MapEmbed query="Cafe" name="Cafe" lat={45} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByTitle(/Google map/)).toBeNull();
    expect(screen.getByText(/Map location unknown/)).toBeDefined();
  });
});
