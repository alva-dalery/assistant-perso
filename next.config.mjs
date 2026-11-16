/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ces paquets utilisent des modules Node.js natifs (net, tls, streams) :
  // il faut les laisser hors du bundle pour qu'ils fonctionnent en serverless.
  serverExternalPackages: ["imapflow", "nodemailer"],
};

export default nextConfig;

