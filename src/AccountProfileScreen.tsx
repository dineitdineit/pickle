import { useState, type ComponentProps } from "react"
import ProfileScreen from "./ProfileScreen"
import UserProfileScreen from "./UserProfileScreen"
type Props = ComponentProps<typeof ProfileScreen> & {
  onSelectRecipe: (id: string) => void
}
export default function AccountProfileScreen(props: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  if (menuOpen)
    return <ProfileScreen {...props} onBack={() => setMenuOpen(false)} />
  return (
    <UserProfileScreen
      authorId={props.userId}
      userId={props.userId}
      onBack={props.onBack}
      onRequireLogin={() => {}}
      onSelectRecipe={props.onSelectRecipe}
      onOpenMenu={() => setMenuOpen(true)}
      onOpenCommunity={props.onOpenCommunity}
      onOpenMyRecipes={props.onOpenMyRecipes}
    />
  )
}
