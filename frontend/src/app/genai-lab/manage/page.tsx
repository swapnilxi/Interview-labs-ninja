import LabManageRoute, { manageMetadata } from '@/modules/labs/common/management/LabManageRoute';
import { labManagementConfig } from '@/modules/labs/common/management/labManagement';

const config = labManagementConfig('genai');

export const metadata = manageMetadata(config);

export default function GenAILabManagePage() {
  return <LabManageRoute config={config} />;
}
