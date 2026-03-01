declare module "chrome-cookies-secure" {
  export function getCookiesPromised(
    url: string,
    format: string,
    profile?: string,
  ): Promise<string>;
}
