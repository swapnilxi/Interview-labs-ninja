import LabManageRoute, { manageMetadata } from '@/modules/labs/common/management/LabManageRoute';
import { labManagementConfig } from '@/modules/labs/common/management/labManagement';

const config = labManagementConfig('cv');

export const metadata = manageMetadata(config);

export default function CVLabManagePage() {
  return <LabManageRoute config={config} />;
}
