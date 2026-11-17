import LabManageRoute, { manageMetadata } from '@/modules/labs/common/management/LabManageRoute';
import { labManagementConfig } from '@/modules/labs/common/management/labManagement';

const config = labManagementConfig('python');

export const metadata = manageMetadata(config);

export default function PythonLabManagePage() {
  return <LabManageRoute config={config} />;
}
