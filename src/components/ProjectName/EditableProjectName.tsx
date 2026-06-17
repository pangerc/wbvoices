import { useAd } from "@/hooks/ad";
import { Input } from "@headlessui/react";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { PencilIcon } from "../ui/icons/PencilIcon";
import { ProjectName } from "./ProjectName";

type EditableProjectNameProps = {
  id: string;
};

export const EditableProjectName = ({ id }: EditableProjectNameProps) => {
  const { metadata, update, isLoading, error } = useAd(id);

  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(metadata.name);

  useEffect(() => setNewName(metadata.name), [metadata.name]);

  const nothing = isLoading || !!error;

  return (
    <div
      className={twMerge(
        "mb-2 px-6 flex gap-2 justify-center group items-center align-middle",
        "sm:max-w-[350px] xl:max-w-[600px] overflow-hidden",
        !nothing && "cursor-pointer",
      )}
    >
      {nothing ? (
        <span className="h-[42px]" />
      ) : isEditing ? (
        <Input
          className={twMerge(
            "flex-1 px-4 py-2 cursor-pointer ",
            "rounded-xl border border-white/20 bg-white/10shadow-lg backdrop-blur-md transition focus:border-white/40 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30",
          )}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={() => {
            setIsEditing(false);
            setNewName(metadata.name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsEditing(false);
              setNewName(metadata.name);
            }
            if (e.key === "Enter") {
              setIsEditing(false);

              if (newName.trim().length !== 0) {
                update({ name: newName });
              } else {
                setNewName(metadata.name);
              }
            }
          }}
          autoFocus
        />
      ) : (
        <>
          <ProjectName
            padding
            name={metadata.name}
            onClick={() => setIsEditing(true)}
          />
          <PencilIcon
            className="opacity-0 group-hover:opacity-100 transition-opacity min-w-4 min-h-4"
            onClick={() => setIsEditing(true)}
          />
        </>
      )}
    </div>
  );
};
