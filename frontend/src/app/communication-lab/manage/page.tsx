import LabManageRoute, { manageMetadata } from '@/modules/labs/common/management/LabManageRoute';
import { labManagementConfig } from '@/modules/labs/common/management/labManagement';

const config = labManagementConfig('communication');

export const metadata = manageMetadata(config);

export default function CommunicationLabManagePage() {
  return <LabManageRoute config={config} />;
}
