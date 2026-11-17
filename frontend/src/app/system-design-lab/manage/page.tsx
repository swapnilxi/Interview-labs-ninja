import LabManageRoute, { manageMetadata } from '@/modules/labs/common/management/LabManageRoute';
import { labManagementConfig } from '@/modules/labs/common/management/labManagement';

const config = labManagementConfig('system_design');

export const metadata = manageMetadata(config);

export default function SystemDesignLabManagePage() {
  return <LabManageRoute config={config} />;
}
