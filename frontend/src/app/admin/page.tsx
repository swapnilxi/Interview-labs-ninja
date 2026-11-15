import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import AdminModule from '@/modules/admin/AdminModule';
import RequireAdmin from '@/modules/admin/RequireAdmin';

export const metadata: Metadata = {
  title: 'Admin Portal - Lab-Ninja',
  description: 'Manage users, roles, and resources.',
};

export default function AdminPage() {
  return (
    <>
      <Header />
      {/* Clear the fixed 60px nav bar (the module and the access gate both start at the top of the page). */}
      <div className="pt-[60px]">
        <RequireAdmin>
          <AdminModule />
        </RequireAdmin>
      </div>
    </>
  );
}
