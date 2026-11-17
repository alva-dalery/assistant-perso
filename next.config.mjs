/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ces paquets utilisent des modules Node.js natifs (net, tls, streams) :
  // il faut les laisser hors du bundle pour qu'ils fonctionnent en serverless.
  // unpdf (pdf.js) est laissé hors du bundle : la lecture des PDF OPT.nc
  // fonctionne alors telle quelle en environnement serverless.
  serverExternalPackages: ["imapflow", "nodemailer", "unpdf"],
};

export default nextConfig;

