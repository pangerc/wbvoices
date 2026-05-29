import { generateProjectId } from "@/utils/projectId";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { Header } from "../Header/Header";
import { Button } from "../ui/buttons";

export function DashboardAppheader() {
  const router = useRouter();

  const onNewAd = () => {
    const adId = generateProjectId();
    console.log(`🚀 Generated client-side adId: ${adId} (not persisted yet)`);

    router.replace(`/ad/${adId}`);
  };

  return (
    <Header>
      <Button icon={PlusIcon} onClick={() => onNewAd()}>
        New Project
      </Button>
    </Header>
  );
}
