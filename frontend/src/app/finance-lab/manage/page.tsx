import LabManageRoute, { manageMetadata } from '@/modules/labs/common/management/LabManageRoute';
import { labManagementConfig } from '@/modules/labs/common/management/labManagement';

const config = labManagementConfig('finance');

export const metadata = manageMetadata(config);

export default function FinanceLabManagePage() {
  return <LabManageRoute config={config} />;
}
