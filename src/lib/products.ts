export const products = [
  { id: 1, dailyRate: 250, color: "โรส", name: "Rose Satin Dress", thai: "เดรสซาตินสีโรส", category: "dress", image: "rose-dress", images: ["/images/rose-dress.png"], tag: "ชุดออกงาน", description: "เดรสซาตินโทนโรส ลุคเรียบหรูสำหรับงานเลี้ยงและวันพิเศษ" },
  { id: 2, dailyRate: 300, color: "ฟ้า", name: "Blue Ruffle Dress", thai: "เดรสระบายสีฟ้า", category: "dress", image: "blue-dress", images: ["/images/blue-dress.png"], tag: "ชุดออกงาน", description: "เดรสเปิดไหล่พร้อมระบายสีฟ้า สำหรับลุคหวานสดใส" },
  { id: 3, dailyRate: 350, color: "ขาว", name: "Cloud Puffer", thai: "พัฟเฟอร์สีขาว", category: "winter", image: "white-puffer", images: ["/images/white-puffer.png"], tag: "เสื้อกันหนาว", description: "เสื้อพัฟเฟอร์สีขาว แมตช์ง่ายสำหรับทริปฤดูหนาว" },
  { id: 4, dailyRate: 300, color: "น้ำตาล", name: "Chocolate Leather", thai: "แจ็กเก็ตหนังสีน้ำตาล", category: "jacket", image: "brown-jacket", images: ["/images/brown-jacket.png"], tag: "แจ็กเก็ต", description: "แจ็กเก็ตหนังโทนช็อกโกแลตพร้อมเข็มขัด เติมความเท่ให้ลุคของคุณ" },
  { id: 5, dailyRate: 200, color: "ทอป", name: "Cozy Winter Boots", thai: "บูทกันหนาวสีทอป", category: "boots", image: "winter-boots", images: ["/images/winter-boots.png"], tag: "รองเท้า", description: "รองเท้าบูทโทนทอป บุขนสีครีมสำหรับแต่งลุคหน้าหนาว" },
  { id: 6, dailyRate: 450, color: "ไอวอรี", name: "Ivory Wool Coat", thai: "โค้ทวูลสีไอวอรี", category: "winter", image: "cream-coat", images: ["/images/cream-coat.png"], tag: "เสื้อกันหนาว", description: "โค้ทวูลตัวยาวสีไอวอรี สำหรับลุคอบอุ่นและเรียบหรู" },
];

export type Product = typeof products[number];
