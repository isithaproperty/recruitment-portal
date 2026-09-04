import ClientReviewLinks from "./ClientReviewLinks";

export default function ClientSubmissionsLayout({children}:{children:React.ReactNode}){
 return <>{children}<ClientReviewLinks/></>;
}
