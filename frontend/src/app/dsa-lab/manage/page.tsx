import LabManageRoute, { manageMetadata } from '@/modules/labs/common/management/LabManageRoute';
import { labManagementConfig } from '@/modules/labs/common/management/labManagement';

const config = labManagementConfig('dsa');

export const metadata = manageMetadata(config);

export default function DSALabManagePage() {
  return <LabManageRoute config={config} />;
}
