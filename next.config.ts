import type { NextConfig } from "next";
import { validateDeploymentEnvironment } from "./src/lib/environment";

validateDeploymentEnvironment(process.env);

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
};

export default nextConfig;
