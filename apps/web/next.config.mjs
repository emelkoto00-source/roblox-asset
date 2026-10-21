const nextConfig = {
  transpilePackages: ["@est/core"],
  serverExternalPackages: [
    "pg",
    "yauzl",
    "bullmq",
    "ioredis",
    "@aws-sdk/client-s3",
  ],
};

export default nextConfig;
