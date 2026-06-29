/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Team management moved out from under the /admin super-admin wall (it's
      // company-admin, not platform-admin). This redirect runs BEFORE the admin
      // layout's super-admin gate, so old /admin/team links reach /team instead of
      // bouncing company admins to Home.
      { source: "/admin/team", destination: "/team", permanent: false },
    ];
  },
};

export default nextConfig;
