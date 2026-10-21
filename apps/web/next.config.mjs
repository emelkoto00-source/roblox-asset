const nextConfig = { transpilePackages: ["@est/core"], output: "standalone", serverExternalPackages: ["pg", "yauzl", "bullmq", "ioredis", "@aws-sdk/client-s3"] };
export default nextConfig;
